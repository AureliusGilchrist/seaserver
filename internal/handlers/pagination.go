package handlers

// paginationDefault fills in a page or per-page value the caller left out.
//
// It exists because the obvious inline form is a nil dereference waiting to happen, and was one:
//
//	if p.Page == nil || p.PerPage == nil {
//		*p.Page = 1      // p.Page is nil on exactly the branch that runs
//		*p.PerPage = 20
//	}
//
// That wrote through the very pointer it had just found to be nil, so any search request that
// omitted either field — and both are tagged `omitempty`, so callers are entitled to omit them —
// panicked in the handler instead of searching. From the outside it looked like search was simply
// broken.
//
// Returning a new pointer rather than assigning through the old one is what makes the nil case
// impossible to get wrong, and taking one field at a time is what stops a missing page from
// deciding anything about per-page.
func paginationDefault(value *int, fallback int) *int {
	if value != nil {
		return value
	}
	return &fallback
}
