import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * Picking a profile photo, and making it small before it leaves the phone.
 *
 * A phone camera writes 3-12MB images; the server takes up to 8MB and
 * re-encodes anyway (sharp). Resizing to 1600px on the long side at JPEG 0.82
 * lands around 300-600KB — a fast upload on a village 4G connection, and
 * still sharper than any screen that will show it.
 */
export interface PickedImage {
  uri: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
}

const MAX_EDGE = 1600;

async function compress(asset: ImagePicker.ImagePickerAsset): Promise<PickedImage> {
  const longEdge = Math.max(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (longEdge > MAX_EDGE) {
    context.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  return { uri: saved.uri, mimeType: "image/jpeg", width: saved.width, height: saved.height };
}

export type PickResult = { ok: true; image: PickedImage } | { ok: false; reason: "cancelled" | "denied" | "failed" };

export async function pickPhoto(source: "library" | "camera"): Promise<PickResult> {
  try {
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: "denied" };
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: "denied" };
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 1,
    };
    const result =
      source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return { ok: false, reason: "cancelled" };

    return { ok: true, image: await compress(result.assets[0]) };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
