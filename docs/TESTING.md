# GitHub Gist Sync - Manual Testing Guide

This document outlines the manual testing procedures for the GitHub Gist sync feature.

## Prerequisites

Before testing:
1. Create a GitHub Personal Access Token with `gist` scope: https://github.com/settings/tokens
2. Have access to multiple browsers or devices for multi-device testing
3. Browser DevTools for network simulation

---

## Task 12: Single Device Testing

### Test 1: Token Validation
1. Open app in browser
2. Click "Sync GitHub Gists..."
3. **Test invalid token**: Enter `invalid-token-123` → Verify error message appears
4. **Test valid token**: Enter your actual GitHub PAT → Verify success

**Expected**: Invalid token shows error; valid token enables sync

### Test 2: Initial Sync Upload
1. Before enabling sync, create 2-3 boards locally with some notes
2. Enable sync with valid token
3. Verify success message shows correct board count
4. Go to https://gist.github.com/ and check your gists
5. Verify gists created with pattern `sticky-kanban-*.json`
6. Verify gists are **private** (not public)

**Expected**: All local boards uploaded as private gists

### Test 3: Auto-Sync After Changes
1. Edit an existing board (add/remove/edit notes)
2. Watch the menu indicator:
   - Should show gray ✓ while syncing
   - Should show black ✓ when done (after ~15 seconds)
3. Go to GitHub gists page
4. Check the timestamp on the gist
5. Verify it was updated recently

**Expected**: Changes sync automatically after 15-second debounce

### Test 4: Board Deletion
1. Delete a board locally via "Delete Board..." menu
2. Wait a few seconds for sync
3. Check GitHub gists page
4. Verify the corresponding gist was deleted

**Expected**: Deleting board locally deletes gist from GitHub

### Test 5: Disable Sync
1. Click "Sync GitHub Gists..."
2. Click "Disable Sync"
3. Verify indicator disappears from menu
4. Make changes to a board
5. Wait 20 seconds
6. Verify NO sync occurs (gist not updated on GitHub)

**Expected**: Disabling sync stops all sync operations

### Test 6: Re-enable Sync
1. Click "Sync GitHub Gists..."
2. Enter token again and enable
3. Verify sync resumes
4. Make a change
5. Verify it syncs to GitHub

**Expected**: Re-enabling sync works correctly

---

## Task 13: Multi-Device Sync Testing

You'll need two browsers/devices for these tests. We'll call them "Device A" and "Device B".

### Test 1: Sync to Second Device
1. **Device A**: Enable sync, create 2-3 boards with notes
2. Wait for sync to complete (black ✓)
3. **Device B**: Open the app
4. **Device B**: Enable sync with the **same GitHub account**
5. **Device B**: Verify boards appear automatically

**Expected**: Boards from Device A appear on Device B

### Test 2: Bidirectional Sync (A → B)
1. **Device A**: Edit a board (add a note "Test from Device A")
2. Wait for sync (~15 seconds, watch for black ✓)
3. **Device B**: Reload the page
4. Verify the note "Test from Device A" appears

**Expected**: Changes from A appear on B after reload

### Test 3: Bidirectional Sync (B → A)
1. **Device B**: Edit the same board (add note "Test from Device B")
2. Wait for sync (~15 seconds)
3. **Device A**: Reload the page
4. Verify the note "Test from Device B" appears

**Expected**: Changes from B appear on A after reload

### Test 4: Deletion Sync
1. **Device A**: Delete a board
2. Wait for sync
3. **Device B**: Reload page
4. Verify board is gone from Device B

**Expected**: Deleting on one device removes from other device

### Test 5: Conflict Resolution (GitHub Wins)
1. **Device A**: Open DevTools → Network tab → Go offline
2. **Device A**: Edit a board (add note "Offline edit")
3. **Device B**: Edit the **same board** (add note "Online edit")
4. Wait for Device B to sync
5. **Device A**: Go back online
6. **Device A**: Reload page
7. Verify Device A now has "Online edit" (GitHub version wins)
8. Verify "Offline edit" is gone (local changes lost)

**Expected**: GitHub version (newer revision) wins conflicts

---

## Task 14: Error Scenarios Testing

### Test 1: Invalid Token
1. Enable sync with valid token
2. Go to GitHub settings and revoke the token
3. Make a board change
4. Wait for sync attempt
5. Verify pink ⚠️ error badge appears
6. Click "Sync GitHub Gists..."
7. Update with a new valid token
8. Verify sync resumes (black ✓)

**Expected**: Invalid token shows error badge; updating token fixes it

### Test 2: Offline Mode
1. Enable sync
2. Open DevTools → Network → Set to "Offline"
3. Make board changes
4. Verify gray ✓ indicator (offline mode, not error)
5. Check localStorage for retry queue: `localStorage.getItem('stickiesboard.sync.queue')`
6. Go back online (Network → Online)
7. Verify sync resumes automatically
8. Verify gray ✓ changes to black ✓

**Expected**: Offline mode shows gray indicator; auto-recovers when online

### Test 3: Retry Queue
1. Enable sync
2. Go offline
3. Edit 3 different boards (create changes)
4. Check retry queue in localStorage (should have 3 items)
5. Go back online
6. Watch all 3 boards sync
7. Verify retry queue clears

**Expected**: All queued changes sync when network returns

### Test 4: Window Close Warning
1. Enable sync
2. Make a board change
3. Immediately try to close the browser tab (within 15 seconds)
4. Verify browser shows "Changes are still syncing" warning
5. Cancel the close
6. Wait 15+ seconds for sync to complete
7. Close tab again
8. Verify NO warning (sync completed)

**Expected**: Warning only appears if sync pending

### Test 5: External Gist Deletion
1. Enable sync with a board
2. Go to https://gist.github.com/
3. Manually delete one of the `sticky-kanban-*.json` gists
4. Reload the app
5. Verify the corresponding board is silently deleted locally
6. Verify NO error message shown

**Expected**: Externally deleted gists cause silent local deletion

### Test 6: Rapid Board Creation
1. Enable sync
2. Quickly create 3 new boards with notes
3. Verify all 3 sync successfully (no rate limit issues)
4. Check GitHub gists - all 3 should be there

**Expected**: Multiple rapid changes don't hit rate limits

---

## Test Results Checklist

Use this to track your testing:

### Single Device (Task 12)
- [ ] Invalid token shows error
- [ ] Valid token enables sync
- [ ] Initial sync uploads all boards
- [ ] Gists are private
- [ ] Auto-sync works after changes (15s debounce)
- [ ] Indicator shows syncing (gray) then synced (black)
- [ ] Board deletion deletes gist
- [ ] Disable sync stops syncing
- [ ] Re-enable sync resumes syncing

### Multi-Device (Task 13)
- [ ] Boards sync to second device
- [ ] Changes sync from Device A to B
- [ ] Changes sync from Device B to A
- [ ] Board deletion syncs across devices
- [ ] Conflict resolution works (GitHub wins)

### Error Scenarios (Task 14)
- [ ] Invalid token shows pink error badge
- [ ] Updating token fixes error
- [ ] Offline mode shows gray indicator
- [ ] Auto-recovery when network returns
- [ ] Retry queue processes all pending items
- [ ] Window close warning when sync pending
- [ ] No warning when sync complete
- [ ] External gist deletion works silently
- [ ] Multiple rapid changes don't cause issues

---

## Performance Checks

- [ ] Local saves remain instant (< 50ms)
- [ ] Sync doesn't block UI
- [ ] Background sync completes in < 2 seconds (typical)
- [ ] App load with 10 synced boards < 5 seconds

---

## Notes

- All tests should be performed in a clean browser profile or incognito mode for consistent results
- Keep browser console open to see any JavaScript errors
- Check Network tab in DevTools to verify API calls
- Most failures will be obvious (UI changes, data missing, errors in console)
- If anything doesn't work as expected, check the console for error messages

---

**Testing Status**: Ready for manual testing
**Date Created**: 2025-01-15
