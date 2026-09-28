/**
 * Plain-English lines about what happens to uploaded media (S67 security
 * wave B, B3). Photos are re-encoded on the server with their location
 * details removed; videos are stored as sent (no re-encode this wave), so the
 * post composers say so under an attached video.
 *
 * The Privacy page carries the same promise (B1 owns that copy):
 * "When you upload a photo, we remove its location details. Videos keep
 * their original details, which can include where they were filmed."
 */

/** Under an attached video in both post composers. */
export const VIDEO_LOCATION_HINT =
  "Videos keep their original details, which can include where they were filmed.";
