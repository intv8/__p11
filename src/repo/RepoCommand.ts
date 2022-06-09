import { AbstractCommand, Command } from "../../deps.ts";
import { InitRepoCommand } from "./InitRepoCommand.ts";

@Command({
  name: "repo",
  description: "Commands for maintaining consistency in partic11e repositories.",
  version: "0.0",
  commands: [InitRepoCommand],
})
export class RepoCommand extends AbstractCommand {
  
}