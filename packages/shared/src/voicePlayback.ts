export const VOICE_PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export type VoicePlaybackSpeed = (typeof VOICE_PLAYBACK_SPEEDS)[number];

export function resolveVoicePlaybackSpeed(value: unknown): VoicePlaybackSpeed {
  return VOICE_PLAYBACK_SPEEDS.includes(value as VoicePlaybackSpeed)
    ? (value as VoicePlaybackSpeed)
    : 1;
}

export function resolveSeekRatio(position: number, width: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(width) || width <= 0) return 0;
  return Math.max(0, Math.min(1, position / width));
}

export interface VoicePlaybackClaim {
  readonly id: string;
  readonly generation: number;
}

export class ExclusiveVoicePlaybackCoordinator {
  private readonly pauseById = new Map<string, () => void>();
  private activeId: string | null = null;
  private generation = 0;

  register(id: string, pause: () => void): () => void {
    this.pauseById.set(id, pause);
    return () => {
      if (this.pauseById.get(id) !== pause) return;
      this.pauseById.delete(id);
      if (this.activeId === id) this.activeId = null;
    };
  }

  activate(id: string): VoicePlaybackClaim {
    if (this.activeId !== id) {
      const previousId = this.activeId;
      this.activeId = id;
      if (previousId !== null) this.pauseById.get(previousId)?.();
    }
    this.generation += 1;
    return { id, generation: this.generation };
  }

  isCurrent(claim: VoicePlaybackClaim): boolean {
    return this.activeId === claim.id && this.generation === claim.generation;
  }

  deactivate(id: string): void {
    if (this.activeId === id) this.activeId = null;
  }
}
