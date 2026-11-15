/**
 * 서울 드론 파일럿 — a single-player, offline-first flight game.
 *
 * The flight itself runs in the browser (public/js). The room only keeps the
 * best score per content so the contract stays satisfied; the client never
 * needs the server to play.
 */

export const meta = {
  game: "서울 드론 파일럿",
  minPlayers: 1,
  maxPlayers: 1,
};

const CONTENT_IDS = ["race", "arrive", "follow", "deliver", "combat"];

export function setup(players) {
  return { players: [...players], best: {} };
}

export function validateAction(state, playerId, action) {
  if (!state.players.includes(playerId)) return { ok: false, error: "not seated" };
  if (!action || action.type !== "record") return { ok: false, error: "unknown action" };
  if (!CONTENT_IDS.includes(action.id)) return { ok: false, error: "unknown content" };
  if (!Number.isFinite(action.score) || action.score < 0 || action.score > 5000) {
    return { ok: false, error: "score out of range" };
  }
  return { ok: true };
}

export function applyAction(state, playerId, action) {
  const prev = state.best[action.id] ?? 0;
  return { ...state, best: { ...state.best, [action.id]: Math.max(prev, Math.floor(action.score)) } };
}

export function isGameOver() {
  return { over: false };
}

export function viewFor(state) {
  return { best: state.best };
}
