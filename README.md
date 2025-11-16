# Welcome to Stickies Kanban Board!

This is a fantasy Mac app. If you run it full screen and zoomed 200%, it can give a feel of the simplicity of pre-internet software. Mashup of different parts (Espy, System 7 styling, Stickies) but not trying to be authentic pixel perfect.

I never really used Stickies much. It was fiddly to collapse/expand notes. And resizing with the tiny corner control. Painful. Still, it was a app that hid a lot of complexity -- generally there was so 'saving' or file location to worry about.

This is a single file (to make it easy to use on various computers) with all it's resources embedded. It's got Espy as it's main font for people who loved the look while waiting for Mac OS 8 all those years.

If you set up a personal access token you can sync this to multiple computers. Not really intended as a full tool. More a quick simple tool to organize your thoughs. It's generally meant as a brief process (rather than document or storing data.) Still, syncing means you can use it for planning your day if you're on multiple computers. 

### Deleting/Closing
The app maintains up to 20 board revisions for undo/redo history. Life is short, don't waste time with "Are you sure you want to delete?" messages. Deleting a board is not undoable. But since this is a 'scratchpad', I think that's a reasonable simplification.

### GitHub Gist Sync Security
When using GitHub Gist sync:
- Personal Access Tokens are stored in localStorage (plaintext)
- Only create tokens with `gist` scope (no repo, user, or admin access needed)
- Each device can have its own token - they should point to the same private gists
- Do not store highly sensitive information in boards

Thanks to Nullboard
	https://github.com/apankrat/nullboard
	
Thanks to Espy Sans Revived
	https://thatkeith.com/articles/espy-sans-revived/
	
Thanks to system7css (Window Title)
	https://github.com/opencoca/system7.css
	
Thanks system.css 
	https://github.com/sakofchit/system.css

Thanks to Infinite Mac
	https://infinitemac.org

Thanks to Jens Alfke & Apple for Stickies Application in System 7.5


