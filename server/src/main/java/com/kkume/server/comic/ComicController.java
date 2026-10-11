package com.kkume.server.comic;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.kkume.server.comic.ComicService.ComicView;

/** 꿈 만화 API(문서 081 01 · 02장). 모두 로그인이 필요하고, 남의 만화는 없는 것(404)으로 답한다 */
@RestController
public class ComicController {

	private final ComicService comics;

	public ComicController(ComicService comics) {
		this.comics = comics;
	}

	@PostMapping("/api/comics")
	@ResponseStatus(HttpStatus.ACCEPTED)
	public ComicView create(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) NewComicRequest request) {
		return this.comics.create(user(jwt), request == null ? null
				: new ComicService.NewComic(request.dreamId(), request.title(), request.dreamText(), request.style()));
	}

	@GetMapping("/api/comics/{comicId}")
	public ComicView get(@AuthenticationPrincipal Jwt jwt, @PathVariable String comicId) {
		return this.comics.get(user(jwt), comicId);
	}

	@GetMapping("/api/comics")
	public Items list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String dreamId) {
		return new Items(this.comics.forDream(user(jwt), dreamId));
	}

	@DeleteMapping("/api/comics/{comicId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String comicId) {
		this.comics.delete(user(jwt), comicId);
	}

	private static UUID user(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}

	public record NewComicRequest(String dreamId, String title, String dreamText, String style) {
	}

	public record Items(List<ComicView> items) {
	}
}
