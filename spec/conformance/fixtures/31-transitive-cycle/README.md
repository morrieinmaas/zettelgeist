# 31-transitive-cycle — `a → b → c → a` flagged as one E_CYCLE

Fixture 04-cycle already covers a 2-node cycle. This one covers the
transitive case to pin down that cycle detection traverses through
intermediate nodes (not just direct mutual deps) and canonicalises the
cycle so it starts at the lex-smallest name.
