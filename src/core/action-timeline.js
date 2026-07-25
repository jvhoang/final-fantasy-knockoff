/**
 * Pure helpers: recent action status + upcoming CT / charge timeline.
 */

/**
 * Most recent battle log line (or idle placeholder).
 * @param {{ log?: string[] }|null} match
 * @returns {{ text: string, empty: boolean }}
 */
export function recentActionStatus(match) {
  const log = match?.log;
  if (!Array.isArray(log) || log.length === 0) {
    return { text: 'Battle begins…', empty: true };
  }
  const text = String(log[log.length - 1] || '').trim() || '…';
  return { text, empty: false };
}

/**
 * Recent log entries newest-last (chronological for display).
 * @param {{ log?: string[] }|null} match
 * @param {number} [limit]
 * @returns {string[]}
 */
export function recentLogEntries(match, limit = 24) {
  const log = match?.log;
  if (!Array.isArray(log) || !log.length) return [];
  const n = Math.max(1, limit | 0);
  return log.slice(-n).map((l) => String(l));
}

/**
 * Estimate CT ticks until a unit reaches active threshold (default 100).
 * @param {{ ct?: number, speed?: number, alive?: boolean }} unit
 * @param {number} [threshold]
 * @returns {number|null} ticks, or null if already ready / KO
 */
export function ticksUntilTurn(unit, threshold = 100) {
  if (!unit || unit.alive === false) return null;
  const ct = Number(unit.ct) || 0;
  const speed = Math.max(1, Number(unit.speed) || 1);
  if (ct >= threshold) return 0;
  return Math.ceil((threshold - ct) / speed);
}

/**
 * Upcoming CT order lines + charged casts for the status timeline panel.
 * @param {{
 *   units?: Array<{
 *     id: string,
 *     name: string,
 *     team: string,
 *     alive: boolean,
 *     ct: number,
 *     speed: number,
 *     charging?: { abilityId: string, chargeLeft: number, castTime: number } | null,
 *   }>,
 *   activeUnitId?: string | null,
 * }} match
 * @param {{ maxUpcoming?: number, ctThreshold?: number }} [opts]
 * @returns {{
 *   upcoming: Array<{
 *     unitId: string,
 *     name: string,
 *     team: string,
 *     ct: number,
 *     speed: number,
 *     ticksUntil: number,
 *     isActive: boolean,
 *     kind: 'turn',
 *   }>,
 *   charges: Array<{
 *     unitId: string,
 *     name: string,
 *     team: string,
 *     abilityId: string,
 *     chargeLeft: number,
 *     castTime: number,
 *     kind: 'cast',
 *   }>,
 * }}
 */
export function buildActionTimeline(match, opts = {}) {
  const maxUpcoming = opts.maxUpcoming ?? 8;
  const threshold = opts.ctThreshold ?? 100;
  const units = (match?.units || []).filter((u) => u && u.alive);
  const activeId = match?.activeUnitId || null;

  const upcoming = units
    .map((u) => {
      const ticks = ticksUntilTurn(u, threshold);
      return {
        unitId: u.id,
        name: u.name || u.id,
        team: u.team,
        ct: u.ct ?? 0,
        speed: u.speed ?? 0,
        ticksUntil: ticks == null ? 999 : ticks,
        isActive: u.id === activeId,
        kind: /** @type {'turn'} */ ('turn'),
      };
    })
    .sort((a, b) => {
      // Active first, then soonest turn
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (a.ticksUntil !== b.ticksUntil) return a.ticksUntil - b.ticksUntil;
      return b.ct - a.ct || b.speed - a.speed;
    })
    .slice(0, maxUpcoming);

  /** @type {Array<{ unitId: string, name: string, team: string, abilityId: string, chargeLeft: number, castTime: number, kind: 'cast' }>} */
  const charges = [];
  for (const u of units) {
    if (u.charging && u.charging.abilityId) {
      charges.push({
        unitId: u.id,
        name: u.name || u.id,
        team: u.team,
        abilityId: u.charging.abilityId,
        chargeLeft: u.charging.chargeLeft ?? 0,
        castTime: u.charging.castTime ?? 0,
        kind: 'cast',
      });
    }
  }
  charges.sort((a, b) => a.chargeLeft - b.chargeLeft || a.name.localeCompare(b.name));

  return { upcoming, charges };
}

/**
 * Compact one-line summary for the status bar (optional second line).
 * @param {ReturnType<typeof buildActionTimeline>} timeline
 * @returns {string}
 */
export function timelineHint(timeline) {
  if (!timeline) return '';
  const cast = timeline.charges?.[0];
  if (cast) {
    return `Cast: ${cast.name} ${cast.abilityId} in ${cast.chargeLeft} CT`;
  }
  const next = timeline.upcoming?.find((u) => !u.isActive) || timeline.upcoming?.[0];
  if (next) {
    if (next.isActive) return `Now: ${next.name}`;
    return `Next: ${next.name} (~${next.ticksUntil} CT)`;
  }
  return '';
}
