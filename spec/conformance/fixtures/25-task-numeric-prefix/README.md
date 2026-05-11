# 25-task-numeric-prefix — `\d+\. ` leading prefix stripped from task text

Writers sometimes hand-number tasks (`- [ ] 1. Do X`). The parser strips
the `<digits>. ` prefix from the displayed text so the rendered task
reads cleanly. The count and check state are unaffected.
