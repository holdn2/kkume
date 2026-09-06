package com.kkume.server.dream;

/**
 * 올려 보낸 기록 한 건이 어떻게 됐는지.
 *
 * <p><b>건별로 답한다.</b> 한 건이 잘못됐다고 배치 전체를 되돌리면, 그 한 건을
 * 고치기 전까지 나머지가 영영 올라가지 못한다. 기기는 {@code saved} 된 것만
 * "올라감"으로 표시하고 나머지는 폰에 남긴다.
 *
 * @param status {@code saved} · {@code skipped} · {@code rejected}
 * @param reason {@code rejected} 일 때만 채워진다
 */
public record SyncResult(String id, String status, String reason) {

	/** 서버에 반영됐다. */
	static SyncResult saved(String id) {
		return new SyncResult(id, "saved", null);
	}

	/** 서버 것이 더 새로워서 그대로 뒀다. 기기는 내려받기로 서버 것을 가져가면 된다. */
	static SyncResult skipped(String id) {
		return new SyncResult(id, "skipped", null);
	}

	/** 받을 수 없는 내용이다. 기기가 고치기 전에는 다시 보내도 같은 답이 온다. */
	static SyncResult rejected(String id, String reason) {
		return new SyncResult(id, "rejected", reason);
	}
}
