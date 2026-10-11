package com.kkume.server.comic;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.kkume.server.comic.ComicScript.Panel;

/**
 * 꿈 나눔에 만화 붙이기(문서 081 03장). 커뮤니티가 쓴다.
 *
 * <p>올릴 때 그림을 글 쪽({@code posts/{postId}/})으로 <b>복사하고</b> 컷 글도 글 행에 복사한다 — 꿈 본문 복사와 같은 이유로,
 * 원래 만화를 지워도 글은 남는다.
 */
@Service
public class ComicAttachments {

	private static final Logger log = LoggerFactory.getLogger(ComicAttachments.class);

	private final ComicStore store;

	private final ComicStorage storage;

	private final ComicService comics;

	public ComicAttachments(ComicStore store, ComicStorage storage, ComicService comics) {
		this.store = store;
		this.storage = storage;
		this.comics = comics;
	}

	/** 붙일 만화. 글 행에 그대로 적는다 */
	public record Source(String layout, String imageKey, String panels) {
	}

	/** 글 상세의 만화. 만화 화면과 같은 모양이라 앱이 같은 뷰어로 그린다 */
	public record PostComic(String layout, List<String> imageUrls, List<Panel> panels) {
	}

	/** 내 것 · 다 만든 것 · 지우지 않은 것만. 아니면 비어 있다 — 커뮤니티가 {@code 400 invalid_comic}으로 답한다 */
	public Optional<Source> find(UUID userId, String comicId) {
		UUID id;
		try {
			id = UUID.fromString(comicId);
		}
		catch (IllegalArgumentException | NullPointerException ex) {
			return Optional.empty();
		}
		return this.store.attachable(id, userId).map(a -> new Source(a.layout(), a.imageKey(), a.panels()));
	}

	/** 글 쪽 그림 키. 글 행을 넣을 때 이 값을 적고, 같은 트랜잭션 안에서 {@link #copy}한다 */
	public static String postImageKey(UUID postId) {
		return ComicStorage.postPrefix(postId) + "comic.jpg";
	}

	/** @throws RuntimeException 복사하지 못했다. 글 트랜잭션이 되돌려지게 그대로 던진다 */
	public void copy(Source source, String toKey) {
		this.storage.copy(source.imageKey(), toKey);
	}

	public PostComic view(String layout, String imageKey, String panels) {
		return new PostComic(layout, List.of(this.storage.presignGet(imageKey)), this.comics.panels(panels));
	}

	/** 글을 지웠다. 그림 복사본을 치운다. 실패해도 글 삭제는 그대로 둔다 — 행이 이미 그림을 가리키지 않는다 */
	public void deletePostCopy(UUID postId) {
		try {
			this.storage.deleteAll(ComicStorage.postPrefix(postId));
		}
		catch (RuntimeException ex) {
			log.warn("꿈 나눔 글의 만화 그림 삭제 실패 post={}", postId, ex);
		}
	}
}
