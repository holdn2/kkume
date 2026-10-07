package com.kkume.server.community;

/** 커뮤니티 밖에서도 보는 숫자. 신고 알림 메일이 "몇 명이면 자동 가림"을 적는다 */
public final class CommunityLimits {

	/** 서로 다른 신고자가 이만큼 모이면 가린다(계획서 001 커뮤니티 최소 운영 장치) */
	public static final int HIDE_AT_REPORTERS = 3;

	private CommunityLimits() {
	}
}
