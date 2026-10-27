package com.kkume.server.comic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.List;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

/** 기준 그림 자르기 · 컷 붙이기(문서 100 2장) */
class ComicImagesTest {

	private static byte[] jpeg(int w, int h, Color... stripes) throws Exception {
		BufferedImage image = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = image.createGraphics();
		for (int i = 0; i < stripes.length; i++) {
			g.setColor(stripes[i]);
			g.fillRect(i * w / stripes.length, 0, w / stripes.length, h);
		}
		g.dispose();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(image, "jpeg", out);
		return out.toByteArray();
	}

	private static BufferedImage read(byte[] bytes) throws Exception {
		return ImageIO.read(new ByteArrayInputStream(bytes));
	}

	private static boolean near(int rgb, Color c) {
		Color got = new Color(rgb);
		return Math.abs(got.getRed() - c.getRed()) < 40 && Math.abs(got.getGreen() - c.getGreen()) < 40
				&& Math.abs(got.getBlue() - c.getBlue()) < 40;
	}

	@Test
	void 기준_그림을_인물_수만큼_같은_너비로_세로로_자른다() throws Exception {
		List<byte[]> parts = ComicImages.split(jpeg(1024, 512, Color.RED, Color.GREEN, Color.BLUE), 3);
		assertThat(parts).hasSize(3);
		BufferedImage middle = read(parts.get(1));
		assertThat(middle.getHeight()).isEqualTo(512);
		assertThat(middle.getWidth()).isBetween(340, 342);
		assertThat(near(middle.getRGB(middle.getWidth() / 2, 256), Color.GREEN)).isTrue();
		assertThat(near(read(parts.get(2)).getRGB(170, 256), Color.BLUE)).isTrue();
	}

	@Test
	void 컷_넷을_1024_한_장에_왼쪽위_오른쪽위_왼쪽아래_오른쪽아래로_붙인다() throws Exception {
		byte[] grid = ComicImages.grid(List.of(jpeg(512, 512, Color.RED), jpeg(300, 300, Color.GREEN), jpeg(512, 512, Color.BLUE),
				jpeg(512, 512, Color.YELLOW)));
		BufferedImage page = read(grid);
		assertThat(page.getWidth()).isEqualTo(1024);
		assertThat(page.getHeight()).isEqualTo(1024);
		assertThat(near(page.getRGB(256, 256), Color.RED)).isTrue();
		// 크기가 다른 컷도 한 칸(512²)에 맞춘다
		assertThat(near(page.getRGB(768, 256), Color.GREEN)).isTrue();
		assertThat(near(page.getRGB(256, 768), Color.BLUE)).isTrue();
		assertThat(near(page.getRGB(768, 768), Color.YELLOW)).isTrue();
	}

	@Test
	void 그림이_아니면_던진다() {
		assertThatThrownBy(() -> ComicImages.split(new byte[] { 1, 2, 3 }, 2)).isInstanceOf(IllegalStateException.class);
	}
}
