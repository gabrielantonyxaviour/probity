// Public surface of the agents lane (brief §3 "Provided").
export { runAgent, type RunAgentOptions } from "./run";
export { makeRunId } from "./run-ids";
export { reevaluate } from "./reevaluate";
export { cancelRun, getRunState, isActive, activeRunIds } from "./cancel";
export type { RunDeps, AgentConfig, TracerPort, BusPort, RunContext } from "./ctx";
export type { TemplateKit, TemplateInfo, ObservationRule, CompileContext } from "../components/template-kit.port";
export type { DocumentsPort, OcrPort, ResolvedInput, ResolvedDoc } from "../agents/letter-reader/docs.port";
export { decide, computeCodes, previewCodes, assertApproveInvariants } from "../policy/gate";
export { selectCallback, callbackEvidence } from "../policy/callback";
export { phonesOnFileAt } from "../policy/contacts";
export { checkRationale as numberCheck } from "../policy/number-check";
export { extractClaims } from "../agents/letter-reader/extract";
