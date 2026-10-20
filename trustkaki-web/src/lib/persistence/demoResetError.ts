export class DemoResetBusyError extends Error {
  constructor() {
    super("A web message is unfinished. Check Activity and finish recovery before resetting the demo.");
    this.name = "DemoResetBusyError";
  }
}
