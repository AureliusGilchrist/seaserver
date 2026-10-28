package anilist

import (
	"context"
	"testing"
)

func familyNode(id, year int, edges ...any) *FamilyNode {
	n := &FamilyNode{ID: id, StartDate: &FamilyDate{Year: year}, Relations: &FamilyRelations{}}
	for i := 0; i+1 < len(edges); i += 2 {
		n.Relations.Edges = append(n.Relations.Edges, &FamilyEdge{RelationType: edges[i].(string), Node: &FamilyEdgeNode{ID: edges[i+1].(int)}})
	}
	return n
}

func TestWalkMediaFamily(t *testing.T) {
	// 1 → sequel 2 → sequel 3; 1 ↔ source 10 (manga); 3 has a CHARACTER link to 99, which belongs to
	// another franchise and must not be pulled in; 1 has a CHARACTER link to 50, listed but not walked.
	all := map[int]*FamilyNode{
		1:  familyNode(1, 2004, "SEQUEL", 2, "SOURCE", 10, "CHARACTER", 50),
		2:  familyNode(2, 2006, "PREQUEL", 1, "SEQUEL", 3),
		3:  familyNode(3, 2008, "PREQUEL", 2, "CHARACTER", 99, "SEQUEL", 1), // a cycle back to 1
		10: familyNode(10, 2001, "ADAPTATION", 1),
		50: familyNode(50, 2010, "CHARACTER", 1, "SEQUEL", 51),
		99: familyNode(99, 2012),
	}
	calls := 0
	fetch := func(_ context.Context, ids []int) ([]*FamilyNode, error) {
		calls++
		out := []*FamilyNode{}
		for _, id := range ids {
			if n, ok := all[id]; ok {
				out = append(out, n)
			}
		}
		return out, nil
	}

	g, err := WalkMediaFamily(context.Background(), 2, 150, fetch)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := g.Nodes[99]; ok {
		t.Fatal("followed a CHARACTER relation out of the franchise")
	}
	if _, ok := g.Nodes[50]; ok {
		t.Fatal("a CHARACTER relation of a non-root media was followed")
	}
	for _, id := range []int{1, 2, 3, 10} {
		if _, ok := g.Nodes[id]; !ok {
			t.Fatalf("missing %d", id)
		}
	}

	members := g.MembersFrom(2)
	order := []int{}
	rel := map[int]FamilyMember{}
	for _, m := range members {
		order = append(order, m.ID)
		rel[m.ID] = *m
	}
	if len(order) != 4 || order[0] != 10 || order[3] != 3 {
		t.Fatalf("expected chronological 10,1,2,3, got %v", order)
	}
	if !rel[1].Direct || rel[1].Relation != "PREQUEL" || rel[10].Direct || rel[10].Depth != 2 || rel[2].Relation != "CURRENT" {
		t.Fatalf("bad labels: %+v", rel)
	}

	// From the root, a CHARACTER relation is listed but not walked.
	g1, _ := WalkMediaFamily(context.Background(), 1, 150, fetch)
	if _, ok := g1.Nodes[50]; !ok {
		t.Fatal("root's CHARACTER relation not fetched")
	}
	if _, ok := g1.Nodes[51]; ok {
		t.Fatal("walked out of a CHARACTER relation")
	}

	// The cap stops the walk.
	g2, _ := WalkMediaFamily(context.Background(), 2, 2, fetch)
	if !g2.Truncated || len(g2.Nodes) > 2 {
		t.Fatalf("cap not applied: %d nodes, truncated=%v", len(g2.Nodes), g2.Truncated)
	}
}
