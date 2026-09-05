// Package cron is a minimal 5-field cron expression scheduler used by the
// panel's automation runner. We avoid pulling in a third-party cron library
// (the project pins deps tightly) and implement exactly the subset
// automation jobs need: numbers, ranges (n-m), steps (n/m), lists (a,b,c),
// '*' and '*/k'.
//
// Fields: minute hour day-of-month month day-of-week.
// Next(now) returns the earliest time strictly after `now` matching the
// expression, checked minute-by-minute (worst-case 525,600 iterations — yawn
// compared to the 60s scheduler tick). Sub-minute precision is intentionally
// unsupported.
package cron

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// fieldLimit bounded by 5-field cron semantics.
type fieldLimit struct{ lo, hi int }

var (
	minuteFL = fieldLimit{0, 59}
	hourFL   = fieldLimit{0, 23}
	domFL    = fieldLimit{1, 31}
	monthFL  = fieldLimit{1, 12}
	dowFL    = fieldLimit{0, 6} // 0 = Sunday
)

// checkRange fails closed on any value outside the field's legal range.
func checkRange(v int, lim fieldLimit, what string) error {
	if v < lim.lo || v > lim.hi {
		return fmt.Errorf("value %d out of range [%d-%d] for %s", v, lim.lo, lim.hi, what)
	}
	return nil
}
// Schedule is a parsed 5-field cron expression.
type Schedule struct {
	minute, hour, dom, month, dow bitmap
}

type bitmap uint64

func (b bitmap) has(v int) bool { return b&(1<<uint(v)) != 0 }
func (b *bitmap) set(v int)     { *b |= 1 << uint(v) }

// parseField accepts one cron field with the rich syntax. Returns a bitmap
// over the field's range or an error.
func parseField(s string, lim fieldLimit) (bitmap, error) {
	if s == "" {
		return 0, errors.New("empty field")
	}
	if s == "*" {
		var b bitmap
		for i := lim.lo; i <= lim.hi; i++ {
			b.set(i)
		}
		return b, nil
	}
	var b bitmap
	// comma list — recurse per element.
	if strings.Contains(s, ",") {
		for _, part := range strings.Split(s, ",") {
			p, err := parseField(part, lim)
			if err != nil {
				return 0, err
			}
			b |= p
		}
		return b, nil
	}
	// step syntax: <range|*>/<step>
	if strings.Contains(s, "/") {
		parts := strings.SplitN(s, "/", 2)
		base := parts[0]
		step, err := strconv.Atoi(strings.TrimSpace(parts[1]))
		if err != nil || step <= 0 {
			return 0, fmt.Errorf("invalid step %q", parts[1])
		}
		lo, hi := lim.lo, lim.hi
		if base != "*" {
			if strings.Contains(base, "-") {
				rp := strings.SplitN(base, "-", 2)
				lo, err = strconv.Atoi(strings.TrimSpace(rp[0]))
				if err != nil {
					return 0, err
				}
				hi, err = strconv.Atoi(strings.TrimSpace(rp[1]))
				if err != nil {
					return 0, err
				}
			} else {
				v, err := strconv.Atoi(strings.TrimSpace(base))
				if err != nil {
					return 0, err
				}
				lo = v
			}
		}
		if lo < lim.lo || hi > lim.hi || lo > hi {
			return 0, fmt.Errorf("range %d-%d out of bounds [%d-%d]", lo, hi, lim.lo, lim.hi)
		}
		for i := lo; i <= hi; i += step {
			b.set(i)
		}
		if b == 0 {
			return 0, fmt.Errorf("empty schedule field %q", s)
		}
		return b, nil
	}
	// range syntax: lo-hi
	if strings.Contains(s, "-") {
		parts := strings.SplitN(s, "-", 2)
		lo, err := strconv.Atoi(strings.TrimSpace(parts[0]))
		if err != nil {
			return 0, err
		}
		hi, err := strconv.Atoi(strings.TrimSpace(parts[1]))
		if err != nil {
			return 0, err
		}
		if lo < lim.lo || hi > lim.hi || lo > hi {
			return 0, fmt.Errorf("range %d-%d out of bounds [%d-%d]", lo, hi, lim.lo, lim.hi)
		}
		for i := lo; i <= hi; i++ {
			b.set(i)
		}
		return b, nil
	}
	// bare number
	v, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return 0, err
	}
	if err := checkRange(v, lim, s); err != nil {
		return 0, err
	}
	b.set(v)
	return b, nil
}

// Parse decodes a 5-field cron expression into a Schedule.
func Parse(expr string) (*Schedule, error) {
	fields := strings.Fields(strings.TrimSpace(expr))
	if len(fields) != 5 {
		return nil, fmt.Errorf("cron: expected 5 fields, got %d", len(fields))
	}
	var s Schedule
	var err error
	if s.minute, err = parseField(fields[0], minuteFL); err != nil {
		return nil, err
	}
	if s.hour, err = parseField(fields[1], hourFL); err != nil {
		return nil, err
	}
	if s.dom, err = parseField(fields[2], domFL); err != nil {
		return nil, err
	}
	if s.month, err = parseField(fields[3], monthFL); err != nil {
		return nil, err
	}
	if s.dow, err = parseField(fields[4], dowFL); err != nil {
		return nil, err
	}
	return &s, nil
}

// matches reports whether t satisfies all five field masks. We follow Vixie
// cron behaviour for the dom/dow OR rule: when both are restricted (!= full
// range), a match on EITHER is enough; when one is full-range, the other is
// the sole gate.
func (s *Schedule) matches(t time.Time) bool {
	mi, hh, dom, mon, dow := t.Minute(), t.Hour(), t.Day(), int(t.Month()), int(t.Weekday())
	if !s.minute.has(mi) {
		return false
	}
	if !s.hour.has(hh) {
		return false
	}
	if !s.month.has(mon) {
		return false
	}
	// dom/dow OR semantics (Vixie cron): if both are restricted, match on
	// either; if only one is restricted, that one is the gate.
	domR := s.domRestricted()
	dowR := s.dowRestricted()
	if domR && dowR {
		return s.dom.has(dom) || s.dow.has(dow)
	}
	if domR {
		return s.dom.has(dom)
	}
	if dowR {
		return s.dow.has(dow)
	}
	return true
}

// "restricted" = at least one bit outside the full range is unset, OR the
// mask doesn't cover the whole range. Using a helper set keeps it cheap.
func (s *Schedule) domRestricted() bool {
	for i := domFL.lo; i <= domFL.hi; i++ {
		if !s.dom.has(i) {
			return true
		}
	}
	return false
}

func (s *Schedule) dowRestricted() bool {
	for i := dowFL.lo; i <= dowFL.hi; i++ {
		if !s.dow.has(i) {
			return true
		}
	}
	return false
}

// Next returns the earliest time strictly after `from` (UTC-agnostic, the
// scheduler always ticks in UTC) that satisfies the schedule. We sweep
// minute-by-minute, which is fine-grained enough since the scheduler runs at
// a 1-minute cadence.
func (s *Schedule) Next(from time.Time) time.Time {
	// Round up to the next minute boundary.
	t := from.Truncate(time.Minute).Add(time.Minute)
	// Cap iterations to ~2 years so a bad expression can't loop forever.
	limit := t.AddDate(2, 0, 0)
	for t.Before(limit) {
		if s.matches(t) {
			return t
		}
		t = t.Add(time.Minute)
	}
	return time.Time{}
}
