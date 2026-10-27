// Fallback only. The live USL was activated from the REST views, so this does not copy rows.
const execute = process.argv.includes("--execute");
const message = execute
  ? "stage-registry refused: activation_form=view and USL counts matched. db/init/05-registry-stage.sql is present and was not loaded."
  : "stage-registry dry-run: not loading registry_stage. activation_form=view.";
process.stdout.write(`${message}\n`);
process.exit(execute ? 2 : 0);
