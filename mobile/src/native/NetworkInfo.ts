import { NativeModules } from 'react-native';

export type NetworkInfoResult = {
  connected: boolean;
  validated: boolean;
  metered: boolean;
  transports: string[];
  latencyMs: number;
  httpStatus: number;
  dnsServers: string[];
  signalStrength: number;
};
export type NetworkTestResult = { samples: number; latenciesMs: number[]; successfulSamples: number; packetLossPercent: number; averageLatencyMs: number; minLatencyMs: number; maxLatencyMs: number };

type NetworkInfoNativeModule = {
  diagnoseNetwork: () => Promise<NetworkInfoResult>;
  runNetworkTest: (samples: number) => Promise<NetworkTestResult>;
};

const { AiosNetworkInfo } = NativeModules as { AiosNetworkInfo?: NetworkInfoNativeModule };

export function getNetworkInfoModule(): NetworkInfoNativeModule {
  if (!AiosNetworkInfo) {
    throw new Error('AiosNetworkInfo native module is unavailable. Run an Android native build after prebuild.');
  }
  return AiosNetworkInfo;
}
