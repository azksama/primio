async fn load_artwork(url: &str, byte_limit: usize) -> Result<image::DynamicImage, String> {
    let mut url = url::Url::parse(url).map_err(|_| "Invalid artwork")?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err("Invalid artwork".into());
    }
    let mut redirects = 0;
    let response = loop {
        let client = crate::network::client_for(&url).await?;
        let response = client
            .get(url.clone())
            .send()
            .await
            .map_err(|_| "Artwork unavailable")?;
        if !response.status().is_redirection() {
            break response;
        }
        if redirects >= 3 {
            return Err("Artwork unavailable".into());
        }
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .ok_or("Invalid artwork")?;
        url = url.join(location).map_err(|_| "Invalid artwork")?;
        redirects += 1;
    };
    if !response.status().is_success() {
        return Err("Artwork unavailable".into());
    }
    let bytes = crate::network::read_body(
        response,
        byte_limit,
        "Artwork unavailable",
        "Artwork too large",
    )
    .await?;
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "Invalid artwork")?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64_000_000);
    reader.limits(limits);
    reader.decode().map_err(|_| "Invalid artwork".into())
}

fn premultiplied_bgra(image: &image::RgbaImage, opacity: f32) -> Vec<u8> {
    let mut data = Vec::with_capacity(image.as_raw().len());
    for pixel in image.pixels() {
        let alpha = pixel[3] as f32 / 255.0 * opacity;
        data.extend_from_slice(&[
            (pixel[2] as f32 * alpha) as u8,
            (pixel[1] as f32 * alpha) as u8,
            (pixel[0] as f32 * alpha) as u8,
            (alpha * 255.0) as u8,
        ]);
    }
    data
}

pub(super) async fn prepare_episode_image(
    url: &str,
    directory: &std::path::Path,
    index: u64,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let image = load_artwork(url, 2_000_000)
        .await?
        .resize_to_fill(width, height, image::imageops::FilterType::Lanczos3)
        .to_rgba8();
    let data = premultiplied_bgra(&image, 1.0);
    tokio::fs::create_dir_all(directory)
        .await
        .map_err(|_| "Artwork cache unavailable")?;
    tokio::fs::write(
        directory.join(format!("episode-{index}-{width}-{height}.bgra")),
        data,
    )
    .await
    .map_err(|_| "Artwork cache unavailable")?;
    Ok(())
}

pub(super) async fn prepare_logo(url: &str, directory: &std::path::Path) -> Result<(), String> {
    let image = load_artwork(url, 4_000_000).await?.to_rgba8();
    let (mut left, mut top, mut right, mut bottom) = (image.width(), image.height(), 0, 0);
    for (x, y, pixel) in image.enumerate_pixels() {
        if pixel[3] > 16 {
            left = left.min(x);
            top = top.min(y);
            right = right.max(x);
            bottom = bottom.max(y);
        }
    }
    let image = if left <= right && top <= bottom {
        image::imageops::crop_imm(&image, left, top, right - left + 1, bottom - top + 1).to_image()
    } else {
        image
    };
    let image = image::DynamicImage::ImageRgba8(image)
        .resize(640, 256, image::imageops::FilterType::Lanczos3)
        .to_rgba8();
    let mut canvas = image::RgbaImage::new(640, 256);
    image::imageops::overlay(
        &mut canvas,
        &image,
        ((640 - image.width()) / 2) as i64,
        ((256 - image.height()) / 2) as i64,
    );
    std::fs::create_dir_all(directory).map_err(|_| "Logo cache unavailable")?;
    for frame in 0..12 {
        let opacity = 0.4 + frame as f32 / 11.0 * 0.6;
        let data = premultiplied_bgra(&canvas, opacity);
        let partial = directory.join(format!("{frame}.partial"));
        std::fs::write(&partial, data).map_err(|_| "Logo cache unavailable")?;
        std::fs::rename(partial, directory.join(format!("{frame}.bgra")))
            .map_err(|_| "Logo cache unavailable")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn converts_rgba_to_premultiplied_bgra_for_mpv_overlays() {
        let image =
            image::RgbaImage::from_raw(2, 1, vec![200, 100, 50, 255, 200, 100, 50, 0]).unwrap();
        assert_eq!(
            premultiplied_bgra(&image, 1.0),
            [50, 100, 200, 255, 0, 0, 0, 0]
        );
        assert_eq!(
            premultiplied_bgra(&image, 0.5),
            [25, 50, 100, 127, 0, 0, 0, 0]
        );
    }
}
