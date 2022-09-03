export function onExit(cb) {
  process.once("beforeExit", cb.bind(null, true));
  process.once("SIGINT", cb.bind(null, true));
  process.once("SIGTERM", cb.bind(null, true));

  process.once("exit", cb.bind(null, false));
}
