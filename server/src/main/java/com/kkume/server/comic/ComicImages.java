package com.kkume.server.comic;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;

/**
 * 그림 자르기 · 붙이기(문서 100 2장 D 방식). 모델이 준 JPEG 를 서버에서 다룬다.
 *
 * <ul>
 * <li>{@link #split} — 인물을 한 줄로 세운 기준 그림을 인물 수만큼 같은 너비로 세로로 자른다. 컷마다 그 컷 인물의 조각만 참조로 넣는다
 * <li>{@link #grid} — 따로 그린 컷 넷을 1024×1024 한 장(2×2)으로 붙인다. 앱은 지금처럼 {@code grid2x2} 한 장을 네 칸으로 잘라 보여 준다
 * </ul>
 */
final class ComicImages {

	/** 붙인 그림 한 칸의 한 변. 붙인 그림은 그 두 배다 */
	static final int CELL = 512;

	private static final float QUALITY = 0.9f;

	private ComicImages() {
	}

	static List<byte[]> split(byte[] lineup, int parts) {
		BufferedImage image = read(lineup);
		int w = image.getWidth();
		List<byte[]> out = new ArrayList<>(parts);
		for (int i = 0; i < parts; i++) {
			int x0 = Math.round((float) i * w / parts);
			int x1 = Math.round((float) (i + 1) * w / parts);
			out.add(jpeg(copy(image.getSubimage(x0, 0, x1 - x0, image.getHeight()))));
		}
		return out;
	}

	/** 왼쪽 위 · 오른쪽 위 · 왼쪽 아래 · 오른쪽 아래 순서 */
	static byte[] grid(List<byte[]> panels) {
		BufferedImage page = new BufferedImage(CELL * 2, CELL * 2, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = page.createGraphics();
		try {
			g.setColor(Color.WHITE);
			g.fillRect(0, 0, page.getWidth(), page.getHeight());
			g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
			for (int i = 0; i < panels.size(); i++) {
				g.drawImage(read(panels.get(i)), (i % 2) * CELL, (i / 2) * CELL, CELL, CELL, null);
			}
		}
		finally {
			g.dispose();
		}
		return jpeg(page);
	}

	private static BufferedImage read(byte[] bytes) {
		try {
			BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
			if (image == null) {
				throw new IllegalStateException("그림을 읽지 못했습니다");
			}
			return image;
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}

	/** 잘라 낸 조각을 RGB 로 옮긴다 — getSubimage 는 원본을 공유하고, JPEG 로는 알파가 있는 형식을 쓸 수 없다 */
	private static BufferedImage copy(BufferedImage part) {
		BufferedImage out = new BufferedImage(part.getWidth(), part.getHeight(), BufferedImage.TYPE_INT_RGB);
		Graphics2D g = out.createGraphics();
		try {
			g.drawImage(part, 0, 0, null);
		}
		finally {
			g.dispose();
		}
		return out;
	}

	private static byte[] jpeg(BufferedImage image) {
		ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
		ByteArrayOutputStream bytes = new ByteArrayOutputStream();
		try (MemoryCacheImageOutputStream out = new MemoryCacheImageOutputStream(bytes)) {
			ImageWriteParam param = writer.getDefaultWriteParam();
			param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
			param.setCompressionQuality(QUALITY);
			writer.setOutput(out);
			writer.write(null, new IIOImage(image, null, null), param);
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
		finally {
			writer.dispose();
		}
		return bytes.toByteArray();
	}
}
