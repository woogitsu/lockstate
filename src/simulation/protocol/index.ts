export {
  decodeMainToWorkerMessage,
  decodeWorkerToMainMessage,
  type ProtocolDecodeError,
  type ProtocolDecodeErrorCode,
  type ProtocolDecodeResult,
  type ProtocolValidationIssue,
} from './decode';
export { collectProtocolTransferables } from './transferables';
export * from './commands';
export {
  MAIN_TO_WORKER_MESSAGE_KINDS,
  SIMULATION_PROTOCOL_VERSION,
  WORKER_TO_MAIN_MESSAGE_KINDS,
  clockControlSchema,
  jsonValueSchema,
  mainToWorkerMessageSchema,
  protocolFaultSchema,
  versionedPayloadSchema,
  workerToMainMessageSchema,
  type DeepReadonly,
  type MainToWorkerMessage,
  type ProtocolFault,
  type SimulationProtocolMessage,
  type VersionedPayload,
  type WorkerToMainMessage,
} from './types';
export {
  MAX_JSON_VALUE_DEPTH,
  isJsonValue,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
} from '../../shared/json';
