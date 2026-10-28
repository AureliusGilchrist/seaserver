package anilist

import (
	"context"
	"sort"
)

// The franchise ("family") of a media: everything reachable through its relations, so a details
// page can show the whole series — every season, film, OVA, spin-off and the source manga — rather
// than only the handful of entries directly attached to the one being viewed.

// FamilyNode is one media in a franchise, as fetched by WalkMediaFamily's fetcher.
type FamilyNode struct {
	ID          int              `json:"id"`
	Type        string           `json:"type"`
	Format      string           `json:"format,omitempty"`
	Status      string           `json:"status,omitempty"`
	Title       *FamilyTitle     `json:"title,omitempty"`
	CoverImage  *FamilyCover     `json:"coverImage,omitempty"`
	BannerImage string           `json:"bannerImage,omitempty"`
	StartDate   *FamilyDate      `json:"startDate,omitempty"`
	Season      string           `json:"season,omitempty"`
	SeasonYear  int              `json:"seasonYear,omitempty"`
	Episodes    int              `json:"episodes,omitempty"`
	Chapters    int              `json:"chapters,omitempty"`
	MeanScore   int              `json:"meanScore,omitempty"`
	IsAdult     bool             `json:"isAdult,omitempty"`
	Relations   *FamilyRelations `json:"relations,omitempty"`
}

type FamilyTitle struct {
	UserPreferred string `json:"userPreferred,omitempty"`
	Romaji        string `json:"romaji,omitempty"`
	English       string `json:"english,omitempty"`
	Native        string `json:"native,omitempty"`
}

type FamilyCover struct {
	ExtraLarge string `json:"extraLarge,omitempty"`
	Large      string `json:"large,omitempty"`
	Medium     string `json:"medium,omitempty"`
	Color      string `json:"color,omitempty"`
}

type FamilyDate struct {
	Year  int `json:"year,omitempty"`
	Month int `json:"month,omitempty"`
	Day   int `json:"day,omitempty"`
}

type FamilyRelations struct {
	Edges []*FamilyEdge `json:"edges"`
}

type FamilyEdge struct {
	RelationType string          `json:"relationType"`
	Node         *FamilyEdgeNode `json:"node"`
}

type FamilyEdgeNode struct {
	ID int `json:"id"`
}

// FamilyMember is a media in the franchise as seen from the media being viewed.
type FamilyMember struct {
	*FamilyNode
	// Relation is how the viewed media relates to this one: its own relation when there is a direct
	// one (SEQUEL, SIDE_STORY…), otherwise the relation of the edge this one was found through.
	Relation string `json:"relation"`
	// Direct is true when the viewed media lists this one among its own relations.
	Direct bool `json:"direct"`
	// Depth is the number of relation hops from the viewed media (0 for itself).
	Depth int `json:"depth"`
}

// FamilyGraph is a fetched franchise: every node, keyed by id.
type FamilyGraph struct {
	Nodes     map[int]*FamilyNode
	Truncated bool
}

// familyTraversable are the relations a walk follows. CHARACTER is left out: two shows sharing a
// cameo are not one franchise, and following those edges pulls in half of a publisher's catalogue.
var familyTraversable = map[string]bool{
	"SEQUEL": true, "PREQUEL": true, "SIDE_STORY": true, "SPIN_OFF": true, "ALTERNATIVE": true,
	"PARENT": true, "SUMMARY": true, "ADAPTATION": true, "SOURCE": true, "COMPILATION": true,
	"CONTAINS": true, "OTHER": true,
}

// WalkMediaFamily fetches the franchise of rootID breadth first, a level at a time. fetch is given
// the ids to fetch (at most 50 at a time, one AniList page) and returns their nodes with relations.
// The walk stops at maxNodes.
func WalkMediaFamily(ctx context.Context, rootID int, maxNodes int, fetch func(ctx context.Context, ids []int) ([]*FamilyNode, error)) (*FamilyGraph, error) {
	graph := &FamilyGraph{Nodes: make(map[int]*FamilyNode)}
	seen := map[int]bool{rootID: true}
	// Reached through a relation that isn't followed (only from the root: a CHARACTER relation).
	// Fetched so it can be listed, but its own relations are not walked.
	leaf := map[int]bool{}
	frontier := []int{rootID}

	for len(frontier) > 0 {
		if err := ctx.Err(); err != nil {
			return graph, err
		}
		var next []int
		for start := 0; start < len(frontier); start += 50 {
			end := min(start+50, len(frontier))
			nodes, err := fetch(ctx, frontier[start:end])
			if err != nil {
				// What was found so far is still worth showing.
				if len(graph.Nodes) > 0 {
					graph.Truncated = true
					return graph, nil
				}
				return nil, err
			}
			for _, n := range nodes {
				if n == nil || n.ID == 0 {
					continue
				}
				graph.Nodes[n.ID] = n
				if n.Relations == nil || leaf[n.ID] {
					continue
				}
				for _, e := range n.Relations.Edges {
					if e == nil || e.Node == nil || e.Node.ID == 0 || seen[e.Node.ID] {
						continue
					}
					if !familyTraversable[e.RelationType] {
						if n.ID != rootID {
							continue
						}
						leaf[e.Node.ID] = true
					}
					if len(seen) >= maxNodes {
						graph.Truncated = true
						continue
					}
					seen[e.Node.ID] = true
					next = append(next, e.Node.ID)
				}
			}
		}
		frontier = next
	}
	return graph, nil
}

// MembersFrom lists the franchise as seen from viewID, oldest first.
func (g *FamilyGraph) MembersFrom(viewID int) []*FamilyMember {
	if g == nil {
		return nil
	}
	direct := map[int]string{}
	if root := g.Nodes[viewID]; root != nil && root.Relations != nil {
		for _, e := range root.Relations.Edges {
			if e != nil && e.Node != nil {
				if _, ok := direct[e.Node.ID]; !ok {
					direct[e.Node.ID] = e.RelationType
				}
			}
		}
	}

	type found struct {
		relation string
		depth    int
	}
	reached := map[int]found{viewID: {relation: "CURRENT", depth: 0}}
	queue := []int{viewID}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		n := g.Nodes[id]
		if n == nil || n.Relations == nil {
			continue
		}
		for _, e := range n.Relations.Edges {
			if e == nil || e.Node == nil || !familyTraversable[e.RelationType] {
				continue
			}
			if _, ok := reached[e.Node.ID]; ok {
				continue
			}
			if _, ok := g.Nodes[e.Node.ID]; !ok {
				continue
			}
			reached[e.Node.ID] = found{relation: e.RelationType, depth: reached[id].depth + 1}
			queue = append(queue, e.Node.ID)
		}
	}

	members := make([]*FamilyMember, 0, len(reached))
	for id, f := range reached {
		n := g.Nodes[id]
		if n == nil {
			continue
		}
		m := &FamilyMember{FamilyNode: n, Relation: f.relation, Depth: f.depth}
		if rel, ok := direct[id]; ok {
			m.Relation = rel
			m.Direct = true
		}
		members = append(members, m)
	}
	// Anything directly related but never walked into (a CHARACTER relation) is still listed.
	for id, rel := range direct {
		if _, ok := reached[id]; ok {
			continue
		}
		if n := g.Nodes[id]; n != nil {
			members = append(members, &FamilyMember{FamilyNode: n, Relation: rel, Direct: true, Depth: 1})
		}
	}

	sort.SliceStable(members, func(i, j int) bool {
		a, b := familySortKey(members[i].FamilyNode), familySortKey(members[j].FamilyNode)
		if a != b {
			return a < b
		}
		return members[i].ID < members[j].ID
	})
	return members
}

// familySortKey orders by start date; undated entries (usually not yet announced) go last.
func familySortKey(n *FamilyNode) int {
	if n.StartDate == nil || n.StartDate.Year == 0 {
		return 99_999_999
	}
	month, day := n.StartDate.Month, n.StartDate.Day
	if month == 0 {
		month = 12
	}
	if day == 0 {
		day = 28
	}
	return n.StartDate.Year*10_000 + month*100 + day
}
