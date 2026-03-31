import type { CanonItemMetadata } from "../types";

export async function fetchImageMetadata(
  buffer: Buffer,
  filename: string
): Promise<CanonItemMetadata> {
  const sharp = (await import("sharp")).default;
  const exifr = await import("exifr");

  // Generate thumbnail (max 800px wide, preserve aspect ratio)
  const thumbnailBuffer = await sharp(buffer)
    .resize({ width: 800, withoutEnlargement: true })
    .png()
    .toBuffer();
  const thumbnail_base64 = `data:image/png;base64,${thumbnailBuffer.toString("base64")}`;

  // Extract image dimensions
  const meta = await sharp(buffer).metadata();
  const width = meta.width;
  const height = meta.height;

  // Extract EXIF data
  let exif: Record<string, unknown> = {};
  try {
    exif = (await exifr.parse(buffer, {
      pick: [
        "Make", "Model", "LensModel",
        "DateTimeOriginal", "CreateDate", "ModifyDate",
        "Artist", "Copyright",
        "ISO", "FocalLength", "FocalLengthIn35mmFormat",
        "ExposureTime", "FNumber", "ExposureMode",
        "Flash", "WhiteBalance",
        "GPSLatitude", "GPSLongitude", "GPSAltitude",
        "ImageWidth", "ImageHeight",
        "XResolution", "YResolution",
        "ColorSpace", "Software",
      ],
    })) ?? {};
  } catch {
    // EXIF not present or unreadable — fine
  }

  // Build title from filename (strip extension, humanize)
  const title = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Creator from EXIF Artist or Copyright
  const creator =
    (exif.Artist as string | undefined) ||
    (exif.Copyright as string | undefined) ||
    "Unknown";

  // Date from EXIF
  const dateTaken =
    (exif.DateTimeOriginal as Date | string | undefined) ||
    (exif.CreateDate as Date | string | undefined);
  const year =
    dateTaken instanceof Date
      ? dateTaken.getFullYear()
      : typeof dateTaken === "string"
      ? parseInt(dateTaken.slice(0, 4), 10) || undefined
      : undefined;

  // Camera info tags
  const tags: string[] = [];
  if (exif.Make && exif.Model) {
    tags.push(`${exif.Make} ${exif.Model}`.trim());
  } else if (exif.Model) {
    tags.push(exif.Model as string);
  }
  if (exif.LensModel) tags.push(exif.LensModel as string);
  if (width && height) tags.push(`${width}×${height}`);

  return {
    title,
    type: "other",
    creator,
    tags,
    thumbnail_base64,
    source_metadata: {
      source_type: "image",
      year,
      raw: {
        filename,
        width,
        height,
        format: meta.format,
        exif,
      },
    },
  };
}
