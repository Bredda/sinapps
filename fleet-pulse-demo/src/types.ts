export type Region = "us-east" | "us-west" | "eu-west" | "ap-south";
export type Role = "web" | "api" | "db" | "cache" | "worker";
export type Status = "healthy" | "warning" | "critical";

export interface ServerTopology {
  id: string;
  name: string;
  region: Region;
  role: Role;
}

export interface FleetOverview {
  generatedAt: string;
  highlightRegion: Region | "all";
  servers: ServerTopology[];
}

export interface ServerMetrics {
  id: string;
  cpuPercent: number;
  memPercent: number;
  latencyMs: number;
  rps: number;
  status: Status;
}

export interface FleetMetrics {
  timestamp: string;
  servers: ServerMetrics[];
}

export const HISTORY_LENGTH = 30;

export type MetricHistory = Record<string, number[]>;
