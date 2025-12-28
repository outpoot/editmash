import { create, toBinary, fromBinary } from "@bufbuild/protobuf";
import {
	type WSMessage as WSMessageProto,
	WSMessageSchema,
	MessageType,
	MediaType,
	TrackType,
	type JoinMatchPayload,
	JoinMatchPayloadSchema,
	type LeaveMatchPayload,
	LeaveMatchPayloadSchema,
	type PlayerJoinedPayload,
	PlayerJoinedPayloadSchema,
	type PlayerLeftPayload,
	PlayerLeftPayloadSchema,
	type PlayerCountPayload,
	PlayerCountPayloadSchema,
	type MatchStatusPayload,
	MatchStatusPayloadSchema,
	type MediaUploadedPayload,
	MediaUploadedPayloadSchema,
	type MediaRemovedPayload,
	MediaRemovedPayloadSchema,
	type ClipAddedPayload,
	ClipAddedPayloadSchema,
	type ClipUpdatedPayload,
	ClipUpdatedPayloadSchema,
	type ClipRemovedPayload,
	ClipRemovedPayloadSchema,
	type ClipSplitPayload,
	ClipSplitPayloadSchema,
	type RequestTimelineSyncPayload,
	RequestTimelineSyncPayloadSchema,
	type TimelineSyncPayload,
	TimelineSyncPayloadSchema,
	type ClipSelectionPayload,
	ClipSelectionPayloadSchema,
	type ClipSelectionInfo,
	ClipSelectionInfoSchema,
	type ZoneSubscribePayload,
	ZoneSubscribePayloadSchema,
	type ZoneClipsPayload,
	ZoneClipsPayloadSchema,
	type SubscribeLobbiesPayload,
	SubscribeLobbiesPayloadSchema,
	type UnsubscribeLobbiesPayload,
	UnsubscribeLobbiesPayloadSchema,
	type LobbiesUpdatePayload,
	LobbiesUpdatePayloadSchema,
	type LobbyCreatedPayload,
	LobbyCreatedPayloadSchema,
	type LobbyUpdatedPayload,
	LobbyUpdatedPayloadSchema,
	type LobbyDeletedPayload,
	LobbyDeletedPayloadSchema,
	type ErrorPayload,
	ErrorPayloadSchema,
	type PingPayload,
	PingPayloadSchema,
	type PongPayload,
	PongPayloadSchema,
	type UserInfo,
	UserInfoSchema,
	type MediaInfo,
	MediaInfoSchema,
	type ClipData as ClipDataProto,
	ClipDataSchema,
	type ClipProperties,
	ClipPropertiesSchema,
	type Track,
	TrackSchema,
	type TimelineData as TimelineDataProto,
	TimelineDataSchema,
	type LobbyInfo as LobbyInfoProto,
	LobbyInfoSchema,
	type MatchConfig,
	MatchConfigSchema,
	type PlayerInfo,
	PlayerInfoSchema,
	type ClipDeltaUpdate,
	ClipDeltaUpdateSchema,
	type ClipBatchUpdate,
	ClipBatchUpdateSchema,
	type ClipIdMapping,
	ClipIdMappingSchema,
	type ClipIdMappingResponse,
	ClipIdMappingResponseSchema,
} from "../src/gen/messages_pb";

export {
	MessageType,
	MediaType,
	TrackType,
	type WSMessageProto,
	WSMessageSchema,
	type JoinMatchPayload,
	type LeaveMatchPayload,
	type PlayerJoinedPayload,
	type PlayerLeftPayload,
	type PlayerCountPayload,
	type MatchStatusPayload,
	type MediaUploadedPayload,
	type MediaRemovedPayload,
	type ClipAddedPayload,
	type ClipUpdatedPayload,
	type ClipRemovedPayload,
	type RequestTimelineSyncPayload,
	type TimelineSyncPayload,
	type ClipSelectionPayload,
	type ClipSelectionInfo,
	type ZoneSubscribePayload,
	type ZoneClipsPayload,
	type SubscribeLobbiesPayload,
	type UnsubscribeLobbiesPayload,
	type LobbiesUpdatePayload,
	type LobbyCreatedPayload,
	type LobbyUpdatedPayload,
	type LobbyDeletedPayload,
	type ErrorPayload,
	type PingPayload,
	type PongPayload,
	type UserInfo,
	type MediaInfo,
	type ClipDataProto,
	type ClipProperties,
	type Track,
	type TimelineDataProto,
	type LobbyInfoProto,
	type MatchConfig,
	type PlayerInfo,
	type ClipDeltaUpdate,
	ClipDeltaUpdateSchema,
	type ClipBatchUpdate,
	ClipBatchUpdateSchema,
	type ClipIdMapping,
	ClipIdMappingSchema,
	type ClipIdMappingResponse,
	ClipIdMappingResponseSchema,
};

export type WSMessage = WSMessageProto;

export interface ClipData {
	id: string;
	type: "video" | "audio" | "image";
	name: string;
	src: string;
	startTime: number;
	duration: number;
	sourceIn: number;
	sourceDuration: number;
	thumbnail?: string;
	properties: Record<string, unknown>;
}

export interface TrackData {
	id: string;
	type: "video" | "audio";
	clips: ClipData[];
}

export interface TimelineData {
	duration: number;
	tracks: TrackData[];
}

export interface MediaData {
	id: string;
	name: string;
	type: "video" | "audio" | "image";
	url: string;
	uploadedBy: { userId: string; username: string };
}

export function serializeMessage(msg: WSMessageProto): Uint8Array {
	return toBinary(WSMessageSchema, msg);
}

export function deserializeMessage(data: Uint8Array | ArrayBuffer): WSMessageProto {
	const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
	return fromBinary(WSMessageSchema, bytes);
}

export function isJoinMatchMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "joinMatch" } } {
	return msg.type === MessageType.JOIN_MATCH && msg.payload?.case === "joinMatch";
}

export function isLeaveMatchMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "leaveMatch" } } {
	return msg.type === MessageType.LEAVE_MATCH && msg.payload?.case === "leaveMatch";
}

export function isMediaUploadedMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "mediaUploaded" } } {
	return msg.type === MessageType.MEDIA_UPLOADED && msg.payload?.case === "mediaUploaded";
}

export function isMediaRemovedMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "mediaRemoved" } } {
	return msg.type === MessageType.MEDIA_REMOVED && msg.payload?.case === "mediaRemoved";
}

export function isClipAddedMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "clipAdded" } } {
	return msg.type === MessageType.CLIP_ADDED && msg.payload?.case === "clipAdded";
}

export function isClipUpdatedMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "clipUpdated" } } {
	return msg.type === MessageType.CLIP_UPDATED && msg.payload?.case === "clipUpdated";
}

export function isClipRemovedMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "clipRemoved" } } {
	return msg.type === MessageType.CLIP_REMOVED && msg.payload?.case === "clipRemoved";
}

export function isClipSplitMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "clipSplit" } } {
	return msg.type === MessageType.CLIP_SPLIT && msg.payload?.case === "clipSplit";
}

export function isTimelineSyncMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "timelineSync" } } {
	return msg.type === MessageType.TIMELINE_SYNC && msg.payload?.case === "timelineSync";
}

export function isRequestTimelineSyncMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "requestTimelineSync" } } {
	return msg.type === MessageType.REQUEST_TIMELINE_SYNC && msg.payload?.case === "requestTimelineSync";
}

export function isPingMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "ping" } } {
	return msg.type === MessageType.PING && msg.payload?.case === "ping";
}

export function isPongMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "pong" } } {
	return msg.type === MessageType.PONG && msg.payload?.case === "pong";
}

export function isPlayerJoinedMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "playerJoined" } } {
	return msg.type === MessageType.PLAYER_JOINED && msg.payload?.case === "playerJoined";
}

export function isPlayerLeftMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "playerLeft" } } {
	return msg.type === MessageType.PLAYER_LEFT && msg.payload?.case === "playerLeft";
}

export function isPlayerCountMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "playerCount" } } {
	return msg.type === MessageType.PLAYER_COUNT && msg.payload?.case === "playerCount";
}

export function isMatchStatusMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "matchStatus" } } {
	return msg.type === MessageType.MATCH_STATUS && msg.payload?.case === "matchStatus";
}

export function isErrorMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "error" } } {
	return msg.type === MessageType.ERROR && msg.payload?.case === "error";
}

export function isSubscribeLobbiesMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "subscribeLobbies" } } {
	return msg.type === MessageType.SUBSCRIBE_LOBBIES && msg.payload?.case === "subscribeLobbies";
}

export function isUnsubscribeLobbiesMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "unsubscribeLobbies" } } {
	return msg.type === MessageType.UNSUBSCRIBE_LOBBIES && msg.payload?.case === "unsubscribeLobbies";
}

export function isLobbiesUpdateMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "lobbiesUpdate" } } {
	return msg.type === MessageType.LOBBIES_UPDATE && msg.payload?.case === "lobbiesUpdate";
}

export function isClipSelectionMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "clipSelection" } } {
	return msg.type === MessageType.CLIP_SELECTION && msg.payload?.case === "clipSelection";
}

export function isZoneSubscribeMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "zoneSubscribe" } } {
	return msg.type === MessageType.ZONE_SUBSCRIBE && msg.payload?.case === "zoneSubscribe";
}

export function isZoneClipsMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "zoneClips" } } {
	return msg.type === MessageType.ZONE_CLIPS && msg.payload?.case === "zoneClips";
}

export function createJoinMatchMessage(matchId: string, userId: string, username: string): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.JOIN_MATCH,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "joinMatch",
			value: create(JoinMatchPayloadSchema, { matchId, userId, username }),
		},
	});
}

export function createLeaveMatchMessage(matchId: string, userId: string): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.LEAVE_MATCH,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "leaveMatch",
			value: create(LeaveMatchPayloadSchema, { matchId, userId }),
		},
	});
}

export function createPlayerJoinedMessage(matchId: string, player: { userId: string; username: string }): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.PLAYER_JOINED,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "playerJoined",
			value: create(PlayerJoinedPayloadSchema, {
				matchId,
				player: create(UserInfoSchema, player),
			}),
		},
	});
}

export function createPlayerLeftMessage(matchId: string, userId: string): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.PLAYER_LEFT,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "playerLeft",
			value: create(PlayerLeftPayloadSchema, { matchId, userId }),
		},
	});
}

export function createPlayerCountMessage(matchId: string, count: number): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.PLAYER_COUNT,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "playerCount",
			value: create(PlayerCountPayloadSchema, { matchId, count }),
		},
	});
}

export function createMatchStatusMessage(
	matchId: string,
	status: string,
	timeRemaining: number | undefined,
	playerCount: number
): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.MATCH_STATUS,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "matchStatus",
			value: create(MatchStatusPayloadSchema, { matchId, status, timeRemaining, playerCount }),
		},
	});
}

export function createMediaUploadedMessage(
	matchId: string,
	media: { id: string; name: string; type: "video" | "audio" | "image"; url: string; uploadedBy: { userId: string; username: string } }
): WSMessageProto {
	const mediaTypeMap = { video: MediaType.VIDEO, audio: MediaType.AUDIO, image: MediaType.IMAGE };
	return create(WSMessageSchema, {
		type: MessageType.MEDIA_UPLOADED,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "mediaUploaded",
			value: create(MediaUploadedPayloadSchema, {
				matchId,
				media: create(MediaInfoSchema, {
					id: media.id,
					name: media.name,
					type: mediaTypeMap[media.type],
					url: media.url,
					uploadedBy: create(UserInfoSchema, media.uploadedBy),
				}),
			}),
		},
	});
}

export function createMediaRemovedMessage(matchId: string, mediaId: string, removedBy: string): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.MEDIA_REMOVED,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "mediaRemoved",
			value: create(MediaRemovedPayloadSchema, { matchId, mediaId, removedBy }),
		},
	});
}

export function createClipAddedMessage(
	matchId: string,
	trackId: string,
	clip: ClipDataProto,
	addedBy: { userId: string; username: string }
): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.CLIP_ADDED,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "clipAdded",
			value: create(ClipAddedPayloadSchema, {
				matchId,
				trackId,
				clip,
				addedBy: create(UserInfoSchema, addedBy),
			}),
		},
	});
}

export function createClipUpdatedMessage(
	matchId: string,
	trackId: string,
	clipId: string,
	updates: ClipDataProto,
	updatedBy: { userId: string; username: string }
): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.CLIP_UPDATED,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "clipUpdated",
			value: create(ClipUpdatedPayloadSchema, {
				matchId,
				trackId,
				clipId,
				updates,
				updatedBy: create(UserInfoSchema, updatedBy),
			}),
		},
	});
}

export function createClipRemovedMessage(
	matchId: string,
	trackId: string,
	clipId: string,
	removedBy: { userId: string; username: string }
): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.CLIP_REMOVED,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "clipRemoved",
			value: create(ClipRemovedPayloadSchema, {
				matchId,
				trackId,
				clipId,
				removedBy: create(UserInfoSchema, removedBy),
			}),
		},
	});
}

export function createClipSplitMessage(
	matchId: string,
	trackId: string,
	originalClip: ClipDataProto,
	newClip: ClipDataProto,
	splitBy: { userId: string; username: string }
): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.CLIP_SPLIT,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "clipSplit",
			value: create(ClipSplitPayloadSchema, {
				matchId,
				trackId,
				originalClip,
				newClip,
				splitBy: create(UserInfoSchema, splitBy),
			}),
		},
	});
}

export function createRequestTimelineSyncMessage(matchId: string): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.REQUEST_TIMELINE_SYNC,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "requestTimelineSync",
			value: create(RequestTimelineSyncPayloadSchema, { matchId }),
		},
	});
}

export function createTimelineSyncMessage(matchId: string, timeline: TimelineDataProto): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.TIMELINE_SYNC,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "timelineSync",
			value: create(TimelineSyncPayloadSchema, { matchId, timeline }),
		},
	});
}

export function createSubscribeLobbiesMessage(): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.SUBSCRIBE_LOBBIES,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "subscribeLobbies",
			value: create(SubscribeLobbiesPayloadSchema, {}),
		},
	});
}

export function createUnsubscribeLobbiesMessage(): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.UNSUBSCRIBE_LOBBIES,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "unsubscribeLobbies",
			value: create(UnsubscribeLobbiesPayloadSchema, {}),
		},
	});
}

export function createLobbiesUpdateMessage(lobbies: LobbyInfoProto[]): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.LOBBIES_UPDATE,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "lobbiesUpdate",
			value: create(LobbiesUpdatePayloadSchema, { lobbies }),
		},
	});
}

export function createLobbyCreatedMessage(lobby: LobbyInfoProto): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.LOBBY_CREATED,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "lobbyCreated",
			value: create(LobbyCreatedPayloadSchema, { lobby }),
		},
	});
}

export function createLobbyUpdatedMessage(lobby: LobbyInfoProto): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.LOBBY_UPDATED,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "lobbyUpdated",
			value: create(LobbyUpdatedPayloadSchema, { lobby }),
		},
	});
}

export function createLobbyDeletedMessage(lobbyId: string): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.LOBBY_DELETED,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "lobbyDeleted",
			value: create(LobbyDeletedPayloadSchema, { lobbyId }),
		},
	});
}

export function createErrorMessage(code: string, message: string): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.ERROR,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "error",
			value: create(ErrorPayloadSchema, { code, message }),
		},
	});
}

export function createPingMessage(): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.PING,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "ping",
			value: create(PingPayloadSchema, {}),
		},
	});
}

export function createPongMessage(): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.PONG,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "pong",
			value: create(PongPayloadSchema, {}),
		},
	});
}

export function toLobbyInfoProto(lobby: {
	id: string;
	name: string;
	joinCode: string;
	hostUsername: string;
	playerCount: number;
	maxPlayers: number;
	status: string;
	isSystemLobby: boolean;
	createdAt: string;
	players: { id: string; username: string; image?: string | null }[];
	matchConfig: {
		timelineDuration: number;
		matchDuration: number;
		maxPlayers: number;
		audioMaxDb: number;
		clipSizeMin: number;
		clipSizeMax: number;
		maxVideoTracks: number;
		maxAudioTracks: number;
		maxClipsPerUser: number;
		constraints: string[];
	};
	matchEndsAt?: string | null;
}): LobbyInfoProto {
	return create(LobbyInfoSchema, {
		id: lobby.id,
		name: lobby.name,
		joinCode: lobby.joinCode,
		hostUsername: lobby.hostUsername,
		playerCount: lobby.playerCount,
		maxPlayers: lobby.maxPlayers,
		status: lobby.status,
		isSystemLobby: lobby.isSystemLobby,
		createdAt: lobby.createdAt,
		players: lobby.players.map((p) =>
			create(PlayerInfoSchema, {
				id: p.id,
				username: p.username,
				image: p.image ?? undefined,
			})
		),
		matchConfig: create(MatchConfigSchema, lobby.matchConfig),
		matchEndsAt: lobby.matchEndsAt ?? undefined,
	});
}

export function createClipDataProto(clip: {
	id: string;
	type: "video" | "audio" | "image";
	name: string;
	src: string;
	startTime: number;
	duration: number;
	sourceIn: number;
	sourceDuration: number;
	thumbnail?: string;
	properties?: Record<string, unknown>;
}): ClipDataProto {
	const mediaTypeMap = { video: MediaType.VIDEO, audio: MediaType.AUDIO, image: MediaType.IMAGE };
	return create(ClipDataSchema, {
		id: clip.id,
		type: mediaTypeMap[clip.type],
		name: clip.name,
		src: clip.src,
		startTime: clip.startTime,
		duration: clip.duration,
		sourceIn: clip.sourceIn,
		sourceDuration: clip.sourceDuration,
		thumbnail: clip.thumbnail,
		properties: clip.properties ? create(ClipPropertiesSchema, clip.properties as Partial<ClipProperties>) : undefined,
	});
}

export function createTrackProto(track: { id: string; type: "video" | "audio"; clips: ClipDataProto[] }): Track {
	const trackTypeMap = { video: TrackType.VIDEO, audio: TrackType.AUDIO };
	return create(TrackSchema, {
		id: track.id,
		type: trackTypeMap[track.type],
		clips: track.clips,
	});
}

export function createTimelineDataProto(timeline: { duration: number; tracks: Track[] }): TimelineDataProto {
	return create(TimelineDataSchema, timeline);
}

export function createClipSelectionMessage(
	matchId: string,
	userId: string,
	username: string,
	userImage: string | undefined,
	highlightColor: string,
	selectedClips: Array<{ clipId: string; trackId: string }>
): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.CLIP_SELECTION,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "clipSelection",
			value: create(ClipSelectionPayloadSchema, {
				matchId,
				userId,
				username,
				userImage,
				highlightColor,
				selectedClips: selectedClips.map((s) => create(ClipSelectionInfoSchema, { clipId: s.clipId, trackId: s.trackId })),
			}),
		},
	});
}

export function createZoneSubscribeMessage(matchId: string, startTime: number, endTime: number): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.ZONE_SUBSCRIBE,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "zoneSubscribe",
			value: create(ZoneSubscribePayloadSchema, { matchId, startTime, endTime }),
		},
	});
}

export function createZoneClipsMessage(matchId: string, startTime: number, endTime: number, tracks: Track[]): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.ZONE_CLIPS,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "zoneClips",
			value: create(ZoneClipsPayloadSchema, { matchId, startTime, endTime, tracks }),
		},
	});
}

export function isClipBatchUpdateMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "clipBatchUpdate" } } {
	return msg.type === MessageType.CLIP_BATCH_UPDATE && msg.payload?.case === "clipBatchUpdate";
}

export function isClipIdMappingMessage(msg: WSMessageProto): msg is WSMessageProto & { payload: { case: "clipIdMapping" } } {
	return msg.type === MessageType.CLIP_ID_MAPPING && msg.payload?.case === "clipIdMapping";
}

export function createClipDeltaUpdate(
	shortId: number,
	changes: {
		startTime?: number;
		duration?: number;
		sourceIn?: number;
		properties?: Partial<ClipProperties>;
		newTrackId?: string;
	}
): ClipDeltaUpdate {
	return create(ClipDeltaUpdateSchema, {
		shortId,
		startTime: changes.startTime,
		duration: changes.duration,
		sourceIn: changes.sourceIn,
		properties: changes.properties ? create(ClipPropertiesSchema, changes.properties) : undefined,
		newTrackId: changes.newTrackId,
	});
}

export function createClipBatchUpdateMessage(
	matchId: string,
	updates: ClipDeltaUpdate[],
	updatedBy: { userId: string; username: string }
): WSMessageProto {
	return create(WSMessageSchema, {
		type: MessageType.CLIP_BATCH_UPDATE,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "clipBatchUpdate",
			value: create(ClipBatchUpdateSchema, {
				matchId,
				updates,
				updatedBy: create(UserInfoSchema, updatedBy),
			}),
		},
	});
}

export function createClipIdMappingMessage(
	matchId: string,
	mappings: Array<{ shortId: number; fullId: string; trackId: string; clipType: "video" | "audio" | "image" }>
): WSMessageProto {
	const mediaTypeMap = { video: MediaType.VIDEO, audio: MediaType.AUDIO, image: MediaType.IMAGE };
	return create(WSMessageSchema, {
		type: MessageType.CLIP_ID_MAPPING,
		timestamp: BigInt(Date.now()),
		payload: {
			case: "clipIdMapping",
			value: create(ClipIdMappingResponseSchema, {
				matchId,
				mappings: mappings.map((m) =>
					create(ClipIdMappingSchema, {
						shortId: m.shortId,
						fullId: m.fullId,
						trackId: m.trackId,
						clipType: mediaTypeMap[m.clipType],
					})
				),
			}),
		},
	});
}

export function computeClipDelta(
	previous: { startTime: number; duration: number; sourceIn: number; properties?: Record<string, unknown> },
	current: { startTime: number; duration: number; sourceIn: number; properties?: Record<string, unknown> }
): { startTime?: number; duration?: number; sourceIn?: number; properties?: Partial<ClipProperties> } | null {
	const delta: { startTime?: number; duration?: number; sourceIn?: number; properties?: Partial<ClipProperties> } = {};
	let hasChanges = false;

	if (Math.abs(previous.startTime - current.startTime) > 0.001) {
		delta.startTime = current.startTime;
		hasChanges = true;
	}
	if (Math.abs(previous.duration - current.duration) > 0.001) {
		delta.duration = current.duration;
		hasChanges = true;
	}
	if (Math.abs(previous.sourceIn - current.sourceIn) > 0.001) {
		delta.sourceIn = current.sourceIn;
		hasChanges = true;
	}

	// Compare properties if either side has them
	if (previous.properties || current.properties) {
		const propDelta: Partial<ClipProperties> = {};
		let hasPropertyChanges = false;

		const prevProps = previous.properties ?? {};
		const currProps = current.properties ?? {};

		const numericKeys = new Set([
			"x",
			"y",
			"width",
			"height",
			"opacity",
			"rotation",
			"scale",
			"speed",
			"volume",
			"pan",
			"pitch",
			"cropTop",
			"cropBottom",
			"cropLeft",
			"cropRight",
			"zoomX",
			"zoomY",
			"freezeFrameTime",
		]);

		const propKeys = [
			"x",
			"y",
			"width",
			"height",
			"opacity",
			"rotation",
			"scale",
			"speed",
			"flipX",
			"flipY",
			"zoomX",
			"zoomY",
			"zoomLinked",
			"freezeFrame",
			"freezeFrameTime",
			"volume",
			"pan",
			"pitch",
			"cropTop",
			"cropBottom",
			"cropLeft",
			"cropRight",
		] as const;

		for (const key of propKeys) {
			const prevVal = prevProps[key];
			const currVal = currProps[key];

			let isDifferent = false;

			if (numericKeys.has(key)) {
				const prevNum = typeof prevVal === "number" ? prevVal : NaN;
				const currNum = typeof currVal === "number" ? currVal : NaN;

				if (Number.isNaN(prevNum) !== Number.isNaN(currNum)) {
					isDifferent = true;
				} else if (!Number.isNaN(prevNum) && !Number.isNaN(currNum)) {
					isDifferent = Math.abs(prevNum - currNum) > 0.001;
				}
			} else {
				isDifferent = prevVal !== currVal;
			}

			if (isDifferent) {
				(propDelta as Record<string, unknown>)[key] = currVal;
				hasPropertyChanges = true;
			}
		}

		if (hasPropertyChanges) {
			delta.properties = propDelta;
			hasChanges = true;
		}
	}

	return hasChanges ? delta : null;
}

export function applyClipDelta(
	current: { startTime: number; duration: number; sourceIn: number; properties?: Record<string, unknown> },
	delta: ClipDeltaUpdate
): void {
	if (delta.startTime !== undefined) current.startTime = delta.startTime;
	if (delta.duration !== undefined) current.duration = delta.duration;
	if (delta.sourceIn !== undefined) current.sourceIn = delta.sourceIn;

	if (delta.properties) {
		if (!current.properties) {
			current.properties = {};
		}
		const props = delta.properties;
		if (props.x !== undefined) current.properties.x = props.x;
		if (props.y !== undefined) current.properties.y = props.y;
		if (props.width !== undefined) current.properties.width = props.width;
		if (props.height !== undefined) current.properties.height = props.height;
		if (props.opacity !== undefined) current.properties.opacity = props.opacity;
		if (props.rotation !== undefined) current.properties.rotation = props.rotation;
		if (props.scale !== undefined) current.properties.scale = props.scale;
		if (props.speed !== undefined) current.properties.speed = props.speed;
		if (props.flipX !== undefined) current.properties.flipX = props.flipX;
		if (props.flipY !== undefined) current.properties.flipY = props.flipY;
		if (props.zoomX !== undefined) current.properties.zoomX = props.zoomX;
		if (props.zoomY !== undefined) current.properties.zoomY = props.zoomY;
		if (props.zoomLinked !== undefined) current.properties.zoomLinked = props.zoomLinked;
		if (props.freezeFrame !== undefined) current.properties.freezeFrame = props.freezeFrame;
		if (props.freezeFrameTime !== undefined) current.properties.freezeFrameTime = props.freezeFrameTime;
		if (props.volume !== undefined) current.properties.volume = props.volume;
		if (props.pan !== undefined) current.properties.pan = props.pan;
		if (props.pitch !== undefined) current.properties.pitch = props.pitch;
		if (props.cropTop !== undefined) current.properties.cropTop = props.cropTop;
		if (props.cropBottom !== undefined) current.properties.cropBottom = props.cropBottom;
		if (props.cropLeft !== undefined) current.properties.cropLeft = props.cropLeft;
		if (props.cropRight !== undefined) current.properties.cropRight = props.cropRight;
	}
}
