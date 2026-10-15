# Simplified dispute sidebar — 16 October 2026

The sidebar header is now one row of compact controls: the collapse toggle, a funnel filter button with a radio-menu popover, and "+ New". Each item has two lines: the type icon and the summary (up to 2 lines), then the ID and the ruling status (a coloured dot plus its label). Group labels ("Yours" / "Samples") appear only when the reviewer has added disputes. While a filter is active, a removable chip ("Route ×") shows under the header.

**The red line:** the sidebar's own border was already the neutral `--border`. The full-height accent line came from the 3 px `:focus-visible` ring on `<main id="main-content" tabindex="-1">`. The Router focuses this landmark after navigation, and when the console is entered by keyboard the ring is drawn along the main region's left edge, right beside the sidebar. The fix is `main[tabindex="-1"]:focus { outline: none; }`: the landmark is a focus target, not a control.

All captures are headless Chrome with AI Offline. D001 was run, and a reviewer dispute was added from it so that "Yours" appears. Before is main at `c8df700` (#60).

| View | Before | After |
| --- | --- | --- |
| Sidebar, light, 1280 px | [Before](before/sidebar-light-1280.png) | [After](after/sidebar-light-1280.png) |
| Sidebar, dark, 1280 px | [Before](before/sidebar-dark-1280.png) | [After](after/sidebar-dark-1280.png) |
| Sidebar, light, 375 px | [Before](before/sidebar-light-375.png) | [After](after/sidebar-light-375.png) |
| Sidebar, dark, 375 px | [Before](before/sidebar-dark-375.png) | [After](after/sidebar-dark-375.png) |
| Presentation mode | [Before](before/sidebar-presentation-1280.png) | [After](after/sidebar-presentation-1280.png) |
| Page, light | [Before](before/page-light-1280.png) | [After](after/page-light-1280.png) |
| Entered by keyboard (the red line) | [Before](before/keyboard-entry-red-line.png) | [After](after/keyboard-entry-red-line.png) |

These captures exist only for the new design:

- The filter menu, [light](after/filter-menu-light-1280.png), [dark at 375 px](after/filter-menu-dark-375.png) and in [presentation mode](after/filter-menu-presentation-1280.png).
- The [active filter with its chip and dot](after/filter-active-light-1280.png).
- The [collapsed rail](after/collapsed-light-1280.png).
- The [focus ring on "+ New"](after/focus-new.png).
