import logfmt from "logfmt";
import { Interface } from "readline";

export enum logLevel {
  Debug = "debug",
  Info = "info",
  Warning = "warning",
  Panic = "panic",
  Fatal = "fatal",
}

export function log(log: { level: logLevel; msg: string }, additional?: Record<string, unknown>) {
  if (log.level == logLevel.Panic || log.level == logLevel.Fatal) {
    logfmt.log({ ...{ time: `${new Date().toISOString()}` }, ...log, ...additional }, process.stderr);
  } else {
    logfmt.log({ ...{ time: `${new Date().toISOString()}` }, ...log, ...additional });
  }
}

export function parseGoMigratorLog(rl: Interface) {
  rl.on("line", (data) => {
    try {
      const message = logfmt.parse(data);
      logfmt.log(message);
    } catch (err) {
      log({ level: logLevel.Warning, msg: "Cant parese log message: " + err });
    }
  });
}
