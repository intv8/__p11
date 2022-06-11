import { Cli } from "./deps.ts";
import commands from "./src/main.ts";

const cli = new Cli({
  name: "p11",
  title: "partic11e utils",
  description:
    "Utilities for maintaining partic11e repositories and code-bases.",
  commands,
  version: "0.0",
});

cli.run();
