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
  logfmt.log({ ...{ time: `${new Date().toISOString()}` }, ...log, ...additional });
}

export function parseGoMigratorLog(rl: Interface) {
  rl.on("line", (data) => {
    try {
      const message = parser(data);
      logfmt.log(message);
    } catch (err) {
      log({ level: logLevel.Warning, msg: "Cant parese log message: " + err });
    }
  });
}

function parser(str: string): Record<string, unknown> {
  const pattern = new RegExp(
    'time="?(?<time>[\\d]{4}-[\\d]{2}-[\\d]{2}T[\\d]{2}:[\\d]{2}:[\\d]{2}(\\.[\\d]{2,3})?Z)"?\\slevel=(?<level>\\w*)\\smsg="?(?<msg>.*?)(\\n)?"'
  );

  const result = pattern.exec(str);

  if (result != null) {
    // console.log(result.groups);
    return result.groups!;
  }

  return {};
}
