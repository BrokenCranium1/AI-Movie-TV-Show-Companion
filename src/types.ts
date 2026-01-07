// Type definitions for StevieTheTV frontend

export interface LibraryItem {
  video_id: string;
  title: string;
  video_path?: string;
  subtitle_path?: string;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface AskRequest {
  title: string;
  timestamp: number;
  subtitles_text: string;
  question: string;
  provider?: string;
  model?: string;
  temperature?: number;
  max_output_tokens?: number;
  previously_watched?: string[];
}

export interface AskResponse {
  answer: string;
}

export interface ContextRequest {
  title: string;
  timestamp: number;
  subtitles_text: string;
  question: string;
}

export interface ContextResponse {
  context: string;
  timestamp: string;
}

export interface MessagePlaceholder {
  element: HTMLElement | null;
  bubble: HTMLElement | null;
  content: HTMLElement | null;
  time: HTMLTimeElement | null;
}

