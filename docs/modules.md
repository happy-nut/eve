# Eve's modules

Which module uses which, from their imports (`npm run map` writes this). 123 modules, 421 lines; each line says what it takes.

```mermaid
flowchart LR
  subgraph g1["창과 화면"]
    m_App["App"]
    m_main["main"]
    m_Sidebar["Sidebar"]
    m_Editor["Editor"]
    m_CardPage["CardPage"]
    m_CalendarPage["CalendarPage"]
    m_TabBar["TabBar"]
    m_MobileBar["MobileBar"]
    m_BottomSheet["BottomSheet"]
    m_Settings["Settings"]
    m_TrashPanel["TrashPanel"]
    m_HistoryPanel["HistoryPanel"]
    m_Outline["Outline"]
    m_Find["Find"]
  end
  subgraph g2["노트 저장소"]
    m_notes["notes"]
    m_groups["groups"]
    m_daily["daily"]
    m_history["history"]
    m_tabs["tabs"]
    m_pending["pending"]
    m_moves["moves"]
    m_takeBody["takeBody"]
    m_snapshot["snapshot"]
    m_comeBack["comeBack"]
    m_reminder["reminder"]
    m_inbox["inbox"]
    m_handoff["handoff"]
    m_paths["paths"]
  end
  subgraph g3["동기화와 가져오기"]
    m_sync["sync"]
    m_github["github"]
    m_merge3["merge3"]
    m_update["update"]
    m_updates["updates"]
    m_transfer["transfer"]
    m_importTree["importTree"]
    m_keep["keep"]
    m_hwp["hwp"]
    m_html["html"]
    m_pdf["pdf"]
    m_notionPaste["notionPaste"]
    m_evelink["evelink"]
    m_platform["platform"]
  end
  subgraph g4["편집기"]
    m_editor["editor"]
    m_blocks["blocks"]
    m_blockHandle["blockHandle"]
    m_keys["keys"]
    m_shortcuts["shortcuts"]
    m_slash["slash"]
    m_suggest["suggest"]
    m_markdown["markdown"]
    m_wikilink["wikilink"]
    m_hangul["hangul"]
    m_highlight["highlight"]
    m_textColor["textColor"]
    m_footnote["footnote"]
    m_find["find"]
    m_selectionLayer["selectionLayer"]
    m_clickTarget["clickTarget"]
    m_date["date"]
    m_emoji["emoji"]
    m_focusWatch["focusWatch"]
    m_drop["drop"]
    m_bookmark["bookmark"]
    m_image["image"]
    m_video["video"]
    m_divider["divider"]
    m_cover["cover"]
    m_icons["icons"]
  end
  subgraph g5["블록 엔진"]
    m_code["code"]
    m_grammars["grammars"]
    m_mermaid["mermaid"]
    m_diagram["diagram"]
    m_diagramBlock["diagramBlock"]
    m_edgeLabels["edgeLabels"]
    m_lanes["lanes"]
    m_seqFold["seqFold"]
    m_charts["charts"]
    m_math["math"]
    m_mathEdit["mathEdit"]
    m_mathParts["mathParts"]
    m_mathRender["mathRender"]
    m_table["table"]
    m_tableHandles["tableHandles"]
    m_toggle["toggle"]
    m_callout["callout"]
    m_calloutKind["calloutKind"]
    m_database["database"]
    m_databaseNode["databaseNode"]
    m_formula["formula"]
    m_kanban["kanban"]
    m_board["board"]
  end
  subgraph g6["블록 화면"]
    m_DiagramBlock["DiagramBlock"]
    m_DiagramForm["DiagramForm"]
    m_FlowEditor["FlowEditor"]
    m_MathEdit["MathEdit"]
    m_Kanban["Kanban"]
    m_Database["Database"]
    m_TableTools["TableTools"]
    m_PdfViewer["PdfViewer"]
    m_ImageViewer["ImageViewer"]
  end
  subgraph g7["UI 기반"]
    m_ui["ui"]
    m_popup["popup"]
    m_motion["motion"]
    m_appearance["appearance"]
    m_hints["hints"]
    m_scrollHint["scrollHint"]
    m_resize["resize"]
    m_swipeRow["swipeRow"]
    m_touchReorder["touchReorder"]
    m_noteMenu["noteMenu"]
    m_Icon["Icon"]
    m_Menu["Menu"]
    m_Confirm["Confirm"]
    m_Select["Select"]
    m_Slider["Slider"]
    m_Toast["Toast"]
    m_Tooltip["Tooltip"]
    m_Hint["Hint"]
    m_Keys["Keys"]
    m_Suggest["Suggest"]
    m_DateMenu["DateMenu"]
    m_EmojiPicker["EmojiPicker"]
    m_EmojiRow["EmojiRow"]
  end
  m_App -->|"notes, CALENDAR 외 2"| m_notes
  m_App -->|"isDailyId, DAILY_TEMPLATE_ID"| m_daily
  m_App -->|"startReminder, syncPhoneReminder"| m_reminder
  m_App -->|"CalendarPage"| m_CalendarPage
  m_App -->|"shortcuts, prettyKeys 외 1"| m_shortcuts
  m_App -->|"sync"| m_sync
  m_App -->|"groups, leafOf 외 1"| m_groups
  m_App -->|"appearance"| m_appearance
  m_App -->|"setGlobalHotkey, win 외 11"| m_platform
  m_App -->|"Sidebar"| m_Sidebar
  m_App -->|"Editor"| m_Editor
  m_App -->|"Confirm"| m_Confirm
  m_App -->|"MobileBar"| m_MobileBar
  m_App -->|"ImageViewer"| m_ImageViewer
  m_App -->|"Hint"| m_Hint
  m_App -->|"hints"| m_hints
  m_App -->|"updates"| m_updates
  m_App -->|"Tooltip"| m_Tooltip
  m_App -->|"Menu"| m_Menu
  m_App -->|"Toast"| m_Toast
  m_App -->|"ui, hooks"| m_ui
  m_App -->|"droppedFiles, isAsset"| m_drop
  m_App -->|"importTree"| m_importTree
  m_App -->|"importPaths, exportCurrent"| m_transfer
  m_App -->|"tabs"| m_tabs
  m_App -->|"TabBar"| m_TabBar
  m_App -->|"parseTicket"| m_handoff
  m_App -->|"parseEveLink"| m_evelink
  m_App -->|"applyAll"| m_inbox
  m_App -->|"focusNote"| m_popup
  m_App -->|"cameBack"| m_comeBack
  m_App -->|"flushEdits"| m_pending
  m_App -->|"claimKeys, handledBy 외 1"| m_keys
  m_App -->|"(lazy)"| m_Settings
  m_App -->|"(lazy)"| m_CardPage
  m_App -->|"(lazy)"| m_PdfViewer
  m_App -->|"(lazy)"| m_TrashPanel
  m_App -->|"(lazy)"| m_HistoryPanel
  m_App -->|"(lazy)"| m_EmojiPicker
  m_BottomSheet -->|"pullDown"| m_popup
  m_BottomSheet -->|"ui"| m_ui
  m_CalendarPage -->|"focusNote"| m_popup
  m_CalendarPage -->|"notes"| m_notes
  m_CalendarPage -->|"previewOf"| m_markdown
  m_CalendarPage -->|"ui"| m_ui
  m_CalendarPage -->|"dailyId, dayKey 외 2"| m_daily
  m_CalendarPage -->|"Icon"| m_Icon
  m_CardPage -->|"panelIn, scrimFade"| m_motion
  m_CardPage -->|"isMobile"| m_platform
  m_CardPage -->|"pullDown, sheet"| m_popup
  m_CardPage -->|"createEditor, runEditorCommand"| m_editor
  m_CardPage -->|"notes"| m_notes
  m_CardPage -->|"cardDoc, splitCard"| m_markdown
  m_CardPage -->|"hooks, ui 외 1"| m_ui
  m_CardPage -->|"Suggest"| m_Suggest
  m_CardPage -->|"DateMenu"| m_DateMenu
  m_CardPage -->|"EmojiRow"| m_EmojiRow
  m_CardPage -->|"Outline"| m_Outline
  m_CardPage -->|"TableTools"| m_TableTools
  m_CardPage -->|"composing, handledBy"| m_keys
  m_Confirm -->|"panelIn, scrimFade"| m_motion
  m_Confirm -->|"ui"| m_ui
  m_Confirm -->|"sheet, held"| m_popup
  m_Confirm -->|"claimKeys"| m_keys
  m_Confirm -->|"copyText"| m_platform
  m_Database -->|"notes, titleOf 외 2"| m_notes
  m_Database -->|"ui, under"| m_ui
  m_Database -->|"previewOf"| m_markdown
  m_Database -->|"isoDay, monthGrid 외 4"| m_date
  m_Database -->|"evaluate"| m_formula
  m_Database -->|"NAME, ROLLUPS 외 14"| m_database
  m_DateMenu -->|"placeAt"| m_popup
  m_DateMenu -->|"caretIn"| m_motion
  m_DateMenu -->|"chipLabel, dateLabel 외 8"| m_date
  m_DiagramBlock -->|"isMobile, copyPng 외 1"| m_platform
  m_DiagramBlock -->|"pictureOf"| m_snapshot
  m_DiagramBlock -->|"fenced"| m_markdown
  m_DiagramBlock -->|"ui, hooks"| m_ui
  m_DiagramBlock -->|"letGo"| m_focusWatch
  m_DiagramBlock -->|"claimKeys"| m_keys
  m_DiagramBlock -->|"renderMermaid, themeKey"| m_mermaid
  m_DiagramBlock -->|"foldSeq, foldable 외 1"| m_seqFold
  m_DiagramBlock -->|"spreadLabels"| m_edgeLabels
  m_DiagramBlock -->|"KINDS, across 외 4"| m_diagram
  m_DiagramBlock -->|"FlowEditor"| m_FlowEditor
  m_DiagramBlock -->|"scrollHint"| m_scrollHint
  m_DiagramBlock -->|"DiagramForm"| m_DiagramForm
  m_DiagramForm -->|"isMobile"| m_platform
  m_DiagramForm -->|"ui"| m_ui
  m_DiagramForm -->|"composing"| m_keys
  m_DiagramForm -->|"sliceColor, branchColor"| m_mermaid
  m_DiagramForm -->|"starter, freshId 외 3"| m_diagram
  m_DiagramForm -->|"Select"| m_Select
  m_Editor -->|"takeBody"| m_takeBody
  m_Editor -->|"createEditor, applyKeymap 외 3"| m_editor
  m_Editor -->|"isMobile, pickImage"| m_platform
  m_Editor -->|"GRADIENTS, coverCss 외 2"| m_cover
  m_Editor -->|"notes, titleOf"| m_notes
  m_Editor -->|"appearance, SIZE_MIN"| m_appearance
  m_Editor -->|"shortcuts"| m_shortcuts
  m_Editor -->|"ui, under 외 1"| m_ui
  m_Editor -->|"Icon"| m_Icon
  m_Editor -->|"groups, leafOf"| m_groups
  m_Editor -->|"Suggest"| m_Suggest
  m_Editor -->|"DateMenu"| m_DateMenu
  m_Editor -->|"EmojiRow"| m_EmojiRow
  m_Editor -->|"Outline"| m_Outline
  m_Editor -->|"TableTools"| m_TableTools
  m_Editor -->|"Find"| m_Find
  m_Editor -->|"randomIcon"| m_icons
  m_Editor -->|"nudgeNote, openedFromList"| m_moves
  m_EmojiPicker -->|"popIn, scrimFade"| m_motion
  m_EmojiPicker -->|"ui"| m_ui
  m_EmojiPicker -->|"isMobile"| m_platform
  m_EmojiPicker -->|"CUSTOM_ICONS, customUrl 외 1"| m_icons
  m_EmojiPicker -->|"floatAt, held 외 2"| m_popup
  m_EmojiPicker -->|"claimKeys, composing"| m_keys
  m_EmojiRow -->|"caretIn"| m_motion
  m_EmojiRow -->|"placeAt"| m_popup
  m_Find -->|"caretIn"| m_motion
  m_Find -->|"findState, setQuery 외 4"| m_find
  m_Find -->|"ui"| m_ui
  m_Find -->|"composing"| m_keys
  m_Find -->|"isMobile"| m_platform
  m_FlowEditor -->|"across, freshId"| m_diagram
  m_FlowEditor -->|"ui, under"| m_ui
  m_FlowEditor -->|"letGo"| m_focusWatch
  m_FlowEditor -->|"claimKeys, composing"| m_keys
  m_FlowEditor -->|"isMobile"| m_platform
  m_FlowEditor -->|"floatAt"| m_popup
  m_Hint -->|"hints"| m_hints
  m_Hint -->|"Keys"| m_Keys
  m_Hint -->|"ui"| m_ui
  m_HistoryPanel -->|"panelIn, scrimFade"| m_motion
  m_HistoryPanel -->|"sheet"| m_popup
  m_HistoryPanel -->|"ui"| m_ui
  m_HistoryPanel -->|"notes, titleOf"| m_notes
  m_HistoryPanel -->|"sync"| m_sync
  m_HistoryPanel -->|"editedLabel"| m_date
  m_HistoryPanel -->|"createEditor"| m_editor
  m_Icon -->|"customIcon, emojiImage 외 1"| m_icons
  m_ImageViewer -->|"panelIn, scrimFade"| m_motion
  m_ImageViewer -->|"ui"| m_ui
  m_ImageViewer -->|"held"| m_popup
  m_Kanban -->|"moveCard, moveColumn 외 2"| m_board
  m_Kanban -->|"plain"| m_notes
  m_Kanban -->|"ui"| m_ui
  m_Kanban -->|"dayKey, fillTemplate"| m_daily
  m_Kanban -->|"scrollHint"| m_scrollHint
  m_Keys -->|"keyParts"| m_shortcuts
  m_MathEdit -->|"isMobile"| m_platform
  m_MathEdit -->|"floatAt, screenInsets 외 1"| m_popup
  m_MathEdit -->|"ui"| m_ui
  m_MathEdit -->|"claimKeys"| m_keys
  m_MathEdit -->|"loadMath, mathMarkup"| m_mathRender
  m_MathEdit -->|"SHELVES, tidyTex 외 1"| m_mathParts
  m_Menu -->|"BottomSheet"| m_BottomSheet
  m_Menu -->|"isMobile"| m_platform
  m_Menu -->|"ui"| m_ui
  m_Menu -->|"prettyKeys"| m_shortcuts
  m_Menu -->|"hints"| m_hints
  m_Menu -->|"popIn"| m_motion
  m_Menu -->|"floatAt, held"| m_popup
  m_MobileBar -->|"hooks"| m_ui
  m_MobileBar -->|"scrollHint"| m_scrollHint
  m_PdfViewer -->|"panelIn"| m_motion
  m_PdfViewer -->|"ui"| m_ui
  m_PdfViewer -->|"pdfSrc"| m_pdf
  m_PdfViewer -->|"openAsset, qlPreview"| m_platform
  m_PdfViewer -->|"hwpPages"| m_hwp
  m_PdfViewer -->|"HWP_FILE, PDF_FILE"| m_drop
  m_PdfViewer -->|"viewSize"| m_popup
  m_Select -->|"popIn"| m_motion
  m_Select -->|"isMobile"| m_platform
  m_Select -->|"BottomSheet"| m_BottomSheet
  m_Select -->|"floatAt"| m_popup
  m_Settings -->|"panelIn, scrimFade"| m_motion
  m_Settings -->|"shortcuts, eventToKeys 외 1"| m_shortcuts
  m_Settings -->|"sync"| m_sync
  m_Settings -->|"storage, autostart 외 7"| m_platform
  m_Settings -->|"normHost, webBase"| m_github
  m_Settings -->|"ui"| m_ui
  m_Settings -->|"appearance, PASTELS 외 4"| m_appearance
  m_Settings -->|"Keys"| m_Keys
  m_Settings -->|"Select"| m_Select
  m_Settings -->|"Slider"| m_Slider
  m_Settings -->|"hints"| m_hints
  m_Settings -->|"updates"| m_updates
  m_Settings -->|"findUpdate"| m_update
  m_Settings -->|"askNotify"| m_reminder
  m_Settings -->|"claimKeys, PRIORITY"| m_keys
  m_Sidebar -->|"isMobile"| m_platform
  m_Sidebar -->|"hints"| m_hints
  m_Sidebar -->|"updates"| m_updates
  m_Sidebar -->|"notes, nested 외 3"| m_notes
  m_Sidebar -->|"isDailyId, DAILY_TEMPLATE_ID 외 1"| m_daily
  m_Sidebar -->|"groups, parentOf 외 3"| m_groups
  m_Sidebar -->|"shortcuts, prettyKeys"| m_shortcuts
  m_Sidebar -->|"typedIn"| m_hangul
  m_Sidebar -->|"sync"| m_sync
  m_Sidebar -->|"ui, under 외 1"| m_ui
  m_Sidebar -->|"composing"| m_keys
  m_Sidebar -->|"importFromFinder, importFromFolder"| m_transfer
  m_Sidebar -->|"Icon"| m_Icon
  m_Sidebar -->|"appearance"| m_appearance
  m_Sidebar -->|"*"| m_moves
  m_Sidebar -->|"focusNote"| m_popup
  m_Sidebar -->|"history"| m_history
  m_Sidebar -->|"touchReorder"| m_touchReorder
  m_Sidebar -->|"swipeRow"| m_swipeRow
  m_Sidebar -->|"previewOf, rawQuery 외 1"| m_markdown
  m_Sidebar -->|"editedLabel"| m_date
  m_Sidebar -->|"tabs"| m_tabs
  m_Suggest -->|"caretIn"| m_motion
  m_Suggest -->|"rows, expand 외 1"| m_suggest
  m_Suggest -->|"Icon"| m_Icon
  m_Suggest -->|"placeAt"| m_popup
  m_TabBar -->|"notes, titleOf 외 1"| m_notes
  m_TabBar -->|"tabs"| m_tabs
  m_TabBar -->|"ui"| m_ui
  m_TabBar -->|"shortcuts"| m_shortcuts
  m_TabBar -->|"Icon"| m_Icon
  m_TabBar -->|"scrollHint"| m_scrollHint
  m_TableTools -->|"floatAt, screenInsets"| m_popup
  m_TableTools -->|"isMobile"| m_platform
  m_TableTools -->|"scrollHint"| m_scrollHint
  m_Toast -->|"ui"| m_ui
  m_Toast -->|"isMobile"| m_platform
  m_Tooltip -->|"Keys"| m_Keys
  m_Tooltip -->|"claimKeys, PRIORITY"| m_keys
  m_Tooltip -->|"floatAt"| m_popup
  m_TrashPanel -->|"panelIn, scrimFade"| m_motion
  m_TrashPanel -->|"sheet"| m_popup
  m_TrashPanel -->|"ui"| m_ui
  m_TrashPanel -->|"notes, titleOf"| m_notes
  m_TrashPanel -->|"editedLabel"| m_date
  m_TrashPanel -->|"isDailyId"| m_daily
  m_TrashPanel -->|"typedIn"| m_hangul
  m_TrashPanel -->|"Icon"| m_Icon
  m_main -->|"App"| m_App
  m_main -->|"isMobile"| m_platform
  m_main -->|"watchFocus"| m_focusWatch
  m_appearance -->|"setWindowSize, isMobile"| m_platform
  m_blockHandle -->|"ui, under"| m_ui
  m_bookmark -->|"fetchUrl, openUrl"| m_platform
  m_callout -->|"ui"| m_ui
  m_callout -->|"isMobile"| m_platform
  m_callout -->|"customIcon"| m_icons
  m_callout -->|"calloutKind"| m_calloutKind
  m_charts -->|"fromCode, ganttDates"| m_diagram
  m_charts -->|"laneSvg"| m_lanes
  m_code -->|"ui, under"| m_ui
  m_code -->|"composing"| m_keys
  m_code -->|"isMobile"| m_platform
  m_code -->|"starter, toCode"| m_diagram
  m_code -->|"mountDiagram"| m_diagramBlock
  m_code -->|"blockBeside"| m_blocks
  m_code -->|"fenceFor"| m_markdown
  m_code -->|"(lazy)"| m_grammars
  m_cover -->|"assetUrl"| m_platform
  m_databaseNode -->|"Database"| m_Database
  m_databaseNode -->|"notes"| m_notes
  m_databaseNode -->|"focusBack"| m_code
  m_databaseNode -->|"defaultDb, parseDb 외 1"| m_database
  m_diagramBlock -->|"DiagramBlock"| m_DiagramBlock
  m_drop -->|"saveAsset"| m_platform
  m_editor -->|"typedIn"| m_hangul
  m_editor -->|"NOTION_COPY, fromNotion"| m_notionPaste
  m_editor -->|"WikiLink"| m_wikilink
  m_editor -->|"DateMention, dayChoices 외 3"| m_date
  m_editor -->|"askNotify"| m_reminder
  m_editor -->|"Callout, CalloutEdges"| m_callout
  m_editor -->|"Highlight, highlightMenu"| m_highlight
  m_editor -->|"Html"| m_html
  m_editor -->|"Toggle, DUPLICATE"| m_toggle
  m_editor -->|"ImageView, LocalImage"| m_image
  m_editor -->|"Bookmark, URL_RE 외 1"| m_bookmark
  m_editor -->|"Kanban, deleteBoard"| m_kanban
  m_editor -->|"DatabaseBlock"| m_databaseNode
  m_editor -->|"FootnoteRef, FootnoteText"| m_footnote
  m_editor -->|"CodeBlock, inCell"| m_code
  m_editor -->|"Pdf"| m_pdf
  m_editor -->|"Video"| m_video
  m_editor -->|"TableNodes, cellEnter 외 2"| m_table
  m_editor -->|"Find"| m_find
  m_editor -->|"SelectionLayer"| m_selectionLayer
  m_editor -->|"BlockHandle"| m_blockHandle
  m_editor -->|"TableHandles"| m_tableHandles
  m_editor -->|"ClickTarget"| m_clickTarget
  m_editor -->|"Divider"| m_divider
  m_editor -->|"MathBlock, MathInline 외 2"| m_math
  m_editor -->|"ui, under"| m_ui
  m_editor -->|"notes, titleOf"| m_notes
  m_editor -->|"headingsOf, splitLink"| m_markdown
  m_editor -->|"pickImage, openUrl 외 1"| m_platform
  m_editor -->|"hints"| m_hints
  m_editor -->|"fileMarkdown, isAsset"| m_drop
  m_editor -->|"shortcuts"| m_shortcuts
  m_editor -->|"calendar, emojiRow 외 7"| m_slash
  m_editor -->|"leaveToApp"| m_keys
  m_editor -->|"loadEmoji, newestEmoji 외 1"| m_emoji
  m_editor -->|"noteMenu"| m_noteMenu
  m_editor -->|"blockBeside, moveBlock 외 9"| m_blocks
  m_editor -->|"holdEdit, dropEdit"| m_pending
  m_editor -->|"appearance"| m_appearance
  m_find -->|"chipLabel"| m_date
  m_groups -->|"notes, nested"| m_notes
  m_groups -->|"history, undoSource"| m_history
  m_groups -->|"appearance"| m_appearance
  m_groups -->|"randomIcon"| m_icons
  m_highlight -->|"ui, under"| m_ui
  m_highlight -->|"appearance"| m_appearance
  m_hints -->|"shortcuts"| m_shortcuts
  m_hints -->|"isMobile"| m_platform
  m_hwp -->|"assetName, assets"| m_platform
  m_image -->|"ui"| m_ui
  m_image -->|"assetUrl, copyImage"| m_platform
  m_image -->|"MIN_WIDTH, alignOf 외 6"| m_resize
  m_importTree -->|"notes, titleOf"| m_notes
  m_importTree -->|"groups, MAX_DEPTH"| m_groups
  m_importTree -->|"TEXT_FILE, DOC_FILE 외 1"| m_drop
  m_importTree -->|"dirOf, nameOf 외 2"| m_paths
  m_importTree -->|"attachmentCandidates, isKeepNote 외 2"| m_keep
  m_inbox -->|"notes, titleOf"| m_notes
  m_inbox -->|"depthOf, MAX_DEPTH"| m_groups
  m_kanban -->|"ui"| m_ui
  m_kanban -->|"Board"| m_Kanban
  m_kanban -->|"focusBack"| m_code
  m_kanban -->|"defaultBoard, parseBoard 외 2"| m_board
  m_keys -->|"ui"| m_ui
  m_keys -->|"eventToKeys"| m_shortcuts
  m_math -->|"loadMath, mathMarkup 외 1"| m_mathRender
  m_math -->|"fullSize"| m_mathParts
  m_math -->|"mountMath"| m_mathEdit
  m_math -->|"scrollHint"| m_scrollHint
  m_math -->|"HTML_TAGS"| m_html
  m_math -->|"inCell"| m_code
  m_mathEdit -->|"MathEdit"| m_MathEdit
  m_mermaid -->|"chartHtml"| m_charts
  m_mermaid -->|"isMobile"| m_platform
  m_moves -->|"notes"| m_notes
  m_moves -->|"CALENDAR_NOTE_ID"| m_daily
  m_moves -->|"groups, parentOf"| m_groups
  m_noteMenu -->|"cardable, cardToLink 외 1"| m_bookmark
  m_noteMenu -->|"ui"| m_ui
  m_noteMenu -->|"openUrl, clipboardText 외 1"| m_platform
  m_noteMenu -->|"exportCurrent"| m_transfer
  m_noteMenu -->|"shortcuts"| m_shortcuts
  m_noteMenu -->|"imageMenu"| m_image
  m_noteMenu -->|"highlightMenu"| m_highlight
  m_noteMenu -->|"COLORS, colorAt 외 1"| m_textColor
  m_notes -->|"storage"| m_platform
  m_notes -->|"flushEdits"| m_pending
  m_notes -->|"appearance"| m_appearance
  m_notes -->|"randomIcon"| m_icons
  m_notes -->|"ui"| m_ui
  m_notes -->|"history, undoSource"| m_history
  m_notes -->|"legacyPlain, onlyHtml 외 3"| m_markdown
  m_notes -->|"CALENDAR_NAME, CALENDAR_NOTE_ID 외 7"| m_daily
  m_pdf -->|"assetUrl, pdfThumb"| m_platform
  m_pdf -->|"DOC_FILE"| m_drop
  m_pdf -->|"ui"| m_ui
  m_popup -->|"isMobile"| m_platform
  m_reminder -->|"appearance"| m_appearance
  m_reminder -->|"notes, titleOf"| m_notes
  m_reminder -->|"dailyId, dayKey 외 1"| m_daily
  m_reminder -->|"isMobile, isTauri 외 1"| m_platform
  m_reminder -->|"remindersIn"| m_date
  m_slash -->|"insertKanban"| m_kanban
  m_slash -->|"insertDatabase"| m_databaseNode
  m_slash -->|"insertFootnote"| m_footnote
  m_slash -->|"insertDiagram"| m_code
  m_slash -->|"swimlaneStarter"| m_diagram
  m_slash -->|"insertMath"| m_math
  m_slash -->|"insertImage"| m_image
  m_slash -->|"ui, under"| m_ui
  m_slash -->|"notes, titleOf"| m_notes
  m_slash -->|"isCustom"| m_icons
  m_slash -->|"pickImage, pickVideo"| m_platform
  m_slash -->|"hints"| m_hints
  m_slash -->|"runEditorCommand"| m_editor
  m_slash -->|"composing"| m_keys
  m_slash -->|"typedIn"| m_hangul
  m_slash -->|"appearance"| m_appearance
  m_slash -->|"isPen, penName"| m_highlight
  m_slash -->|"COLORS, colorText"| m_textColor
  m_swipeRow -->|"isMobile"| m_platform
  m_sync -->|"notes, parse 외 1"| m_notes
  m_sync -->|"groups"| m_groups
  m_sync -->|"flushEdits"| m_pending
  m_sync -->|"assets, github 외 6"| m_platform
  m_sync -->|"Repo, FileHashes 외 5"| m_github
  m_sync -->|"seal, open 외 1"| m_handoff
  m_sync -->|"merge3"| m_merge3
  m_table -->|"imageMarkdown"| m_image
  m_table -->|"hidePipesInMath"| m_math
  m_tableHandles -->|"ui, under"| m_ui
  m_tabs -->|"notes, CALENDAR"| m_notes
  m_tabs -->|"appearance"| m_appearance
  m_takeBody -->|"getMarkdown"| m_editor
  m_takeBody -->|"serializeBoard"| m_board
  m_touchReorder -->|"isMobile"| m_platform
  m_transfer -->|"notes, titleOf"| m_notes
  m_transfer -->|"importTree"| m_importTree
  m_transfer -->|"files, importAsset 외 8"| m_platform
  m_transfer -->|"commonDir, dirOf"| m_paths
  m_transfer -->|"ui"| m_ui
  m_transfer -->|"flushEdits"| m_pending
  m_ui -->|"history"| m_history
  m_ui -->|"focusNote"| m_popup
  m_ui -->|"isMobile"| m_platform
  m_ui -->|"shifting, shiftingUntil"| m_focusWatch
  m_updates -->|"findUpdate"| m_update
  m_updates -->|"isMobile, isTauri 외 2"| m_platform
  m_updates -->|"ui"| m_ui
  m_updates -->|"(lazy)"| m_sync
  m_video -->|"assetUrl"| m_platform
  m_video -->|"VIDEO_FILE"| m_drop
  m_video -->|"nameOf, sizeGrip 외 2"| m_resize
  m_wikilink -->|"customIcon"| m_icons
  m_wikilink -->|"splitAlias"| m_markdown
```
