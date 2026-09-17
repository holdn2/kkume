package com.kkume.server.job;

/**
 * 음성을 글로 바꾸는 쪽. <b>아직 구현이 없다.</b>
 *
 * <p>어느 서비스를 쓸지는 #1의 ③(잠결 음성 정확도)을 사용자 본인 녹음으로 확인한 뒤 정한다(문서 039 07장).
 * 그때까지 이 빈이 없으면 {@link SttWorker}는 작업을 받아 두기만 하고 돌리지 않는다 —
 * 가짜 변환 결과가 운영 DB에 들어가면 사용자의 {@code text}에 합쳐져 되돌릴 수 없다.
 */
public interface SttTranscriber {

	/**
	 * @param audioLocation 기록의 {@code audio_url}. 저장소 안의 위치 식별자다
	 * @return 변환 원문. 앱이 {@code [녹음 변환]} 규칙대로 합친다 — 서버는 가공하지 않는다
	 * @throws SttException 변환하지 못했을 때
	 */
	String transcribe(String audioLocation);
}
