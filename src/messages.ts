export interface FetchAvatarRequest {
  type: "fetchAvatar";
  url: string;
}

export interface FetchAvatarOk {
  ok: true;
  dataUrl: string;
}

export interface FetchAvatarErr {
  ok: false;
  error: string;
}

export type FetchAvatarResponse = FetchAvatarOk | FetchAvatarErr;
