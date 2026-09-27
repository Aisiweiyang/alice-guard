import { runAttackSuite } from "../src/demo/attack-lab";

if (process.argv.slice(2).length > 0) {
  throw new Error("ATTACK_LAB_TAKES_NO_ARGUMENTS");
}

const summary = await runAttackSuite();
console.log(JSON.stringify(summary, null, 2));
if (!summary.allPassed) process.exitCode = 1;
