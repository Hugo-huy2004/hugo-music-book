// Ảnh đại diện nằm trong bucket công khai `avatars`; hồ sơ lưu sẵn URL đầy đủ (chương 8).
// Không có ảnh thì trả undefined để giao diện vẽ chữ cái đầu.
export function getAvatarUri(avatarUrl?: string | null, _username?: string | null): string | undefined {
  return avatarUrl || undefined;
}
