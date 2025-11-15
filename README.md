Will need readme here. Licenses.

## Configuration Notes

### Revision History Limit
The app maintains up to 20 board revisions for undo/redo history. This provides adequate undo capability while keeping localStorage usage reasonable.

### GitHub Gist Sync Security
When using GitHub Gist sync:
- Personal Access Tokens are stored in localStorage (plaintext)
- Only create tokens with `gist` scope (no repo, user, or admin access needed)
- Each device can have its own token - recommended for security
- You can revoke tokens individually from GitHub settings
- Do not store highly sensitive information in boards

Thanks to Stickies Board
Thanks to Espy Sans Revived
Thanks to system7css (Window Title)

Figma File
