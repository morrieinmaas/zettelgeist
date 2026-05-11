# 34-part-of-cluster — `part_of` sets `partOf` on nodes; no edges produced

`part_of` is a grouping hint, not a dependency. It populates `partOf` on
the graph node but does NOT create a `depends_on` edge to the parent.
Renderers may visually cluster children, but the graph file records the
relationship only via the node attribute.
