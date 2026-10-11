package com.kkume.server.community;

import java.time.Instant;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.kkume.server.community.CommunityViews.Blocks;
import com.kkume.server.community.CommunityViews.Comment;
import com.kkume.server.community.CommunityViews.LikeState;
import com.kkume.server.community.CommunityViews.Page;
import com.kkume.server.community.CommunityViews.PostDetail;
import com.kkume.server.community.CommunityViews.PostForDream;
import com.kkume.server.community.CommunityViews.PostSummary;
import com.kkume.server.community.CommunityViews.Profile;

/**
 * 커뮤니티 API. 계약은 문서 056 03장이다.
 *
 * <p>읽기(피드 · 글 상세 · 프로필 · 사용자 글)는 토큰 없이 된다({@code SecurityConfig}). 그때 {@code jwt}는 {@code null}이다.
 * 사용자는 <b>토큰에서만</b> 온다 — 본문이나 쿼리로 받지 않는다.
 */
@RestController
public class CommunityController {

	private final CommunityService community;

	public CommunityController(CommunityService community) {
		this.community = community;
	}

	@GetMapping("/api/community/posts")
	public Page<PostSummary> feed(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String sort,
			@RequestParam(required = false) String cursor) {
		return this.community.feed(viewer(jwt), sort, cursor);
	}

	@GetMapping("/api/community/posts/{postId}")
	public PostDetail post(@AuthenticationPrincipal Jwt jwt, @PathVariable String postId) {
		return this.community.post(viewer(jwt), postId);
	}

	@PostMapping("/api/community/posts")
	@ResponseStatus(HttpStatus.CREATED)
	public PostSummary createPost(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) NewPostRequest request) {
		return this.community.createPost(viewer(jwt), request == null ? null
				: new CommunityService.NewPost(request.dreamId(), request.title(), request.dreamText(),
						request.dreamRecordedAt(), request.body(), request.comicId()));
	}

	@DeleteMapping("/api/community/posts/{postId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deletePost(@AuthenticationPrincipal Jwt jwt, @PathVariable String postId) {
		this.community.deletePost(viewer(jwt), postId);
	}

	@GetMapping("/api/community/dreams/{dreamId}/post")
	public PostForDream postForDream(@AuthenticationPrincipal Jwt jwt, @PathVariable String dreamId) {
		return new PostForDream(this.community.postForDream(viewer(jwt), dreamId));
	}

	@PutMapping("/api/community/posts/{postId}/like")
	public LikeState like(@AuthenticationPrincipal Jwt jwt, @PathVariable String postId,
			@RequestBody(required = false) LikeRequest request) {
		return this.community.setLiked(viewer(jwt), postId, request != null && request.liked());
	}

	@PostMapping("/api/community/posts/{postId}/comments")
	@ResponseStatus(HttpStatus.CREATED)
	public Comment addComment(@AuthenticationPrincipal Jwt jwt, @PathVariable String postId,
			@RequestBody(required = false) CommentRequest request) {
		return this.community.addComment(viewer(jwt), postId, request == null ? null : request.body(),
				request == null ? null : request.parentId());
	}

	@DeleteMapping("/api/community/comments/{commentId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteComment(@AuthenticationPrincipal Jwt jwt, @PathVariable String commentId) {
		this.community.deleteComment(viewer(jwt), commentId);
	}

	@PostMapping("/api/community/reports")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void report(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) ReportRequest request) {
		this.community.report(viewer(jwt), request == null ? null : request.type(), request == null ? null : request.id(),
				request == null ? null : request.reason());
	}

	@GetMapping("/api/users/{userId}/profile")
	public Profile profile(@AuthenticationPrincipal Jwt jwt, @PathVariable String userId) {
		return this.community.profile(viewer(jwt), userId);
	}

	@GetMapping("/api/users/{userId}/posts")
	public Page<PostSummary> postsBy(@AuthenticationPrincipal Jwt jwt, @PathVariable String userId,
			@RequestParam(required = false) String sort, @RequestParam(required = false) String cursor) {
		return this.community.postsBy(viewer(jwt), userId, sort, cursor);
	}

	@GetMapping("/api/community/blocks")
	public Blocks blocks(@AuthenticationPrincipal Jwt jwt) {
		return new Blocks(this.community.blocks(viewer(jwt)));
	}

	@PutMapping("/api/community/blocks/{userId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void block(@AuthenticationPrincipal Jwt jwt, @PathVariable String userId) {
		this.community.block(viewer(jwt), userId);
	}

	@DeleteMapping("/api/community/blocks/{userId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void unblock(@AuthenticationPrincipal Jwt jwt, @PathVariable String userId) {
		this.community.unblock(viewer(jwt), userId);
	}

	private static UUID viewer(Jwt jwt) {
		return jwt == null ? null : UUID.fromString(jwt.getSubject());
	}

	/** {@code comicId}는 선택이다. 붙이려면 내 것 · 다 만든 만화여야 한다(문서 081 03장) */
	public record NewPostRequest(String dreamId, String title, String dreamText, Instant dreamRecordedAt, String body,
			String comicId) {
	}

	public record LikeRequest(boolean liked) {
	}

	public record CommentRequest(String body, String parentId) {
	}

	public record ReportRequest(String type, String id, String reason) {
	}
}
