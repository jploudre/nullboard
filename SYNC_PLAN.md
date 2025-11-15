# Cloud Sync Implementation Plan for Nullboard/Sticky Kanban Board

**Date**: 2025-11-13
**Objective**: Add cloud sync capability to enable multi-device editing while maintaining local-first performance

## Current State

### Data Storage
- **Format**: JSON stored in localStorage
- **Structure**: Boards with lists containing notes
- **Size**: ~5-50KB per board revision
- **Revisions**: Up to 50 revisions per board (undo history)
- **Total Size**: ~100KB typical use case
- **Key Files**:
  - `board.js` - Storage implementation (localStorage)
  - `functions.js` - Import/export logic
  - `stickiesboard.html` - Data models

### Requirements
- Local-first operation (fast saves/loads)
- Cloud storage for ~100KB
- Multi-device sync
- Simple implementation
- No server hosting required
- Single-user (conflict resolution not critical)

## Selected Solution: GitHub Gists

### Why GitHub Gists?
1. **Simplest implementation** - REST API with 5 basic operations
2. **Free forever** - No storage limits for this use case
3. **Built-in versioning** - Gist history tracks changes
4. **No server needed** - Direct API calls from browser
5. **~100 lines of code** - Minimal complexity
6. **Familiar auth** - GitHub personal access token

### Alternatives Considered

| Option | Score | Pros | Cons |
|--------|-------|------|------|
| **GitHub Gists** | 8/10 | Simple, free, versioned | No real-time sync, rate limits |
| PouchDB+CouchDB | 9/10 | Best sync, conflict handling | Requires hosting or paid service |
| Firebase | 7.5/10 | Real-time, good docs | Large SDK, Google dependency |
| Cloudflare KV | 7/10 | Very fast | Complex setup, low write limits |
| JSONBin.io | 7/10 | Simple API | Tight limits, startup risk |
| Dropbox API | 6.5/10 | Familiar to users | OAuth complexity |

## Implementation Plan

### Phase 1: Core Sync Functions
1. **Create sync module** (`sync-gist.js`)
   - `createGist()` - Create new gist for board data
   - `updateGist()` - Save current state to gist
   - `fetchGist()` - Load state from gist
   - `listGists()` - Show available synced boards
   - `deleteGist()` - Remove cloud sync

### Phase 2: UI Integration
1. **Add sync UI** to existing interface
   - Settings panel for GitHub token
   - "Sync to Cloud" button
   - "Load from Cloud" option
   - Sync status indicator
   - Last synced timestamp

### Phase 3: Auto-Sync Logic
1. **Background sync**
   - Auto-save every N minutes (configurable)
   - Sync on board changes (debounced)
   - Pull on app load
   - Conflict resolution: last-write-wins with manual merge option

### Phase 4: Migration & Polish
1. **User experience**
   - Migration wizard for existing boards
   - Clear privacy notice
   - Export/backup before first sync
   - Error handling and retry logic
   - Offline queue for writes

## Key Gotchas & Mitigations

### Primary Concerns

#### 1. CORS Issues
- **Gotcha**: Browser may block cross-origin requests
- **Mitigation**: GitHub API supports CORS, should work directly
- **Fallback**: Simple proxy if needed

#### 2. Rate Limits
- **Gotcha**: 5000 requests/hour for authenticated users
- **Mitigation**: Debounce saves, cache reads locally
- **Implementation**: Track request count, warn user if approaching limit

#### 3. Auth Token Security
- **Gotcha**: Token stored in localStorage (accessible to any script)
- **Mitigation**: Use token with minimal scopes (gist-only)
- **User Education**: Clear warning about token security
- **Best Practice**: Token never leaves user's browser

#### 4. Public vs Private Gists
- **Gotcha**: Secret gists still accessible if URL leaked
- **Mitigation**: Use private gists by default
- **User Education**: Explain privacy implications
- **Recommendation**: Don't store sensitive data

#### 5. Conflict Resolution
- **Gotcha**: Two devices editing simultaneously
- **Mitigation**: Last-write-wins as default
- **Enhancement**: Show diff if conflict detected
- **Power User Option**: Manual merge for conflicts

#### 6. Existing Data Migration
- **Gotcha**: Don't lose current localStorage boards
- **Mitigation**: Export backup before first sync
- **Strategy**: Gradual migration (board-by-board)
- **Safety**: Keep localStorage as primary until sync confirmed

### Secondary Concerns

#### Network Failures
- **Gotcha**: Sync fails when offline
- **Mitigation**: Queue writes and retry
- **UI Feedback**: Clear offline indicator
- **Recovery**: Automatic retry on reconnect

#### API Changes
- **Gotcha**: GitHub might change API
- **Mitigation**: Version API calls, handle errors gracefully
- **Monitoring**: Test endpoint on app load

#### User Account Requirement
- **Gotcha**: Requires GitHub account
- **Mitigation**: Clear onboarding, link to GitHub signup
- **Alternative**: Keep local-only mode available

#### Backup Strategy
- **Gotcha**: What if GitHub is down?
- **Mitigation**: Keep local export option
- **Best Practice**: Periodic local backups

## Code Changes Required

### New Files
- `sync-gist.js` - GitHub Gist sync module (~150 lines)
- `sync-ui.js` - UI controls for sync (~100 lines)

### Modified Files
- `board.js` - Add sync hooks to save operations
- `functions.js` - Integrate sync with import/export
- `stickiesboard.html` - Add sync UI elements
- `boardstyles.css` - Style sync components

### Estimated LOC
- Core sync: ~150 lines
- UI integration: ~100 lines
- Error handling: ~50-100 lines
- **Total**: ~300-400 lines

## Technical Implementation Details

### GitHub Gist API Endpoints

```javascript
// Create gist
POST https://api.github.com/gists
Headers: Authorization: token GITHUB_TOKEN
Body: {
  "description": "Sticky Kanban Board - {boardTitle}",
  "public": false,
  "files": {
    "board.json": {
      "content": "{JSON stringified board data}"
    }
  }
}

// Update gist
PATCH https://api.github.com/gists/{gist_id}
Headers: Authorization: token GITHUB_TOKEN
Body: {
  "files": {
    "board.json": {
      "content": "{JSON stringified board data}"
    }
  }
}

// Get gist
GET https://api.github.com/gists/{gist_id}
Headers: Authorization: token GITHUB_TOKEN

// List gists
GET https://api.github.com/gists
Headers: Authorization: token GITHUB_TOKEN

// Delete gist
DELETE https://api.github.com/gists/{gist_id}
Headers: Authorization: token GITHUB_TOKEN
```

### Storage Schema

```javascript
// New localStorage keys
stickiesboard.sync.enabled = true/false
stickiesboard.sync.token = "github_personal_access_token"
stickiesboard.sync.gistId.{boardId} = "gist_id_for_board"
stickiesboard.sync.lastSync.{boardId} = timestamp
stickiesboard.sync.autoSync = true/false
stickiesboard.sync.syncInterval = 300000 // 5 minutes in ms
```

### Sync Logic Flow

```
User makes change to board
  ↓
Save to localStorage (immediate)
  ↓
Debounce timer starts (2 seconds)
  ↓
Timer completes, check if sync enabled
  ↓
If enabled: Push to GitHub Gist
  ↓
Update lastSync timestamp
  ↓
Show sync status in UI
```

### Conflict Detection

```
On app load or manual sync:
  1. Fetch gist from GitHub
  2. Compare gist timestamp with localStorage timestamp
  3. If gist newer:
     - Show notification
     - Offer to load cloud version or keep local
     - Option to view diff
  4. If local newer:
     - Push to cloud automatically
  5. If timestamps equal:
     - No action needed
```

## Timeline Estimate

- **Phase 1** (Core sync functions): 2-3 hours
- **Phase 2** (UI integration): 1-2 hours
- **Phase 3** (Auto-sync logic): 1-2 hours
- **Phase 4** (Migration & polish): 1-2 hours
- **Testing & debugging**: 1-2 hours
- **Total**: 6-11 hours of development

## Testing Strategy

### Test Cases

1. **Single Device**
   - Save board locally
   - Sync to cloud
   - Clear localStorage
   - Load from cloud
   - Verify data integrity

2. **Two Devices**
   - Edit on Device A
   - Sync
   - Load on Device B
   - Verify changes appear
   - Edit on Device B
   - Sync back to Device A

3. **Offline Mode**
   - Disconnect network
   - Make changes
   - Verify queued for sync
   - Reconnect
   - Verify sync completes

4. **Conflict Scenarios**
   - Edit same board on two devices simultaneously
   - Sync from both
   - Verify conflict detection
   - Test resolution options

5. **Rate Limits**
   - Rapid successive saves
   - Verify debouncing works
   - Verify doesn't hit rate limit

6. **Migration**
   - Create boards in localStorage
   - Enable sync
   - Verify migration wizard works
   - Verify backup created

7. **Error Handling**
   - Invalid token
   - Network failure
   - API errors (404, 500, etc.)
   - Verify error messages and recovery

### Testing Tools
- Multiple browsers/devices
- Browser DevTools (Network tab, disable cache)
- localStorage inspector
- GitHub Gists page (verify gist creation/updates)

## Rollback Plan

- Sync is additive (doesn't remove localStorage)
- Users can disable sync and revert to local-only
- Export function remains unchanged
- No breaking changes to existing functionality
- If sync fails, app continues working locally
- Clear "Remove Sync" option to delete gist and disable

## Privacy & Security Notes

### User Privacy
- Data stored in user's own GitHub account (not third-party server)
- User has full control via GitHub account settings
- Can delete gists at any time from GitHub
- Private gists by default (not publicly listed)

### Security Considerations
- Token stored in localStorage (same security as current data)
- Use GitHub token with minimal scopes: `gist` only
- No token transmission except to GitHub API
- HTTPS enforced for all API calls
- Clear warning about token security in UI

### Disclosure Requirements
- Clear privacy notice in sync setup
- Explain where data is stored
- Link to GitHub's privacy policy
- Option to opt-out anytime

### Recommended Token Scopes
```
Required: gist (create/update/delete gists)
NOT required: repo, user, admin, etc.
```

## Future Enhancements (Optional)

### Short Term
- Sync status indicator (synced, syncing, error)
- Conflict resolution UI with diff viewer
- Sync history timeline
- Multiple device management (see which devices synced)

### Medium Term
- Real-time sync via polling (every 30s when active)
- Export all synced boards at once
- Sync statistics (data usage, sync frequency)
- Compression for larger boards

### Long Term
- Shared boards (multi-user collaboration)
- End-to-end encryption for sensitive data
- Alternative backends (Dropbox, Firebase, etc.)
- Sync via WebSocket for instant updates
- Mobile app with sync support

### Advanced Features
- Branching/versioning (like git)
- Merge conflict resolution tools
- Sync selective boards (not all)
- Family/team sharing with permissions

## Resources & References

### GitHub Gist API Documentation
- https://docs.github.com/en/rest/gists

### Creating Personal Access Token
- https://github.com/settings/tokens
- Required scope: `gist`

### Similar Implementations
- Gistpad (VS Code extension using Gists)
- Notational Velocity alternatives
- Other local-first apps with Gist sync

### Libraries (Optional)
- Octokit.js (GitHub API client) - may be overkill
- Fetch API (native, recommended for simplicity)

## Decision Log

### Why Not PouchDB?
- Best technical solution
- Requires hosting CouchDB or paid Cloudant
- Adds complexity (~50KB library)
- Overkill for single-user use case

### Why Not Firebase?
- Large SDK (~200KB+)
- Google dependency
- Potential billing surprises
- More complexity than needed

### Why Not Dropbox?
- OAuth flow creates user friction
- Requires Dropbox account (not as common as GitHub for devs)
- More complex file API

### Why GitHub Gists?
- Simple REST API
- Developers likely have GitHub accounts
- No hosting required
- Built-in versioning
- Minimal code changes
- Perfect for ~100KB JSON data

## Success Metrics

### Implementation Success
- [ ] Core sync functions working
- [ ] UI integrated seamlessly
- [ ] Auto-sync operational
- [ ] Error handling robust
- [ ] Migration path smooth

### User Success
- [ ] Can sync board across devices
- [ ] Syncs complete in <2 seconds
- [ ] No data loss in testing
- [ ] Clear status indicators
- [ ] Easy to enable/disable

### Performance
- localStorage operations remain instant
- Sync doesn't block UI
- Debouncing prevents rate limit issues
- Offline mode graceful

## Notes

- Keep it simple: Don't over-engineer
- Local-first: localStorage is source of truth
- User control: Easy to disable/remove sync
- Backwards compatible: Existing boards unaffected
- Graceful degradation: Works offline
- Clear communication: User always knows sync status

---

**Status**: ✅ Implementation complete
**Next Step**: Manual testing (see docs/TESTING.md), then merge to master
**Owner**: Jonathan
**Last Updated**: 2025-01-15
**Implementation Date**: 2025-01-15
