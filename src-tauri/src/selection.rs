use rand::Rng;
use std::collections::HashSet;

pub fn draw(
    candidates: &[(String, u32)],
    cycle: &HashSet<String>,
    mode: &str,
    rng: &mut impl Rng,
) -> Option<(String, bool)> {
    if candidates.is_empty() {
        return None;
    }
    let reset = mode == "cycle" && candidates.iter().all(|(id, _)| cycle.contains(id));
    let eligible: Vec<_> = candidates
        .iter()
        .filter(|(id, _)| mode != "cycle" || reset || !cycle.contains(id))
        .collect();
    if mode != "weighted" {
        return Some((
            eligible[rng.random_range(0..eligible.len())].0.clone(),
            reset,
        ));
    }
    let weight = |times: u32| 1.0 / (1.0 + f64::from(times));
    let total: f64 = eligible.iter().map(|(_, times)| weight(*times)).sum();
    let mut ticket = rng.random_range(0.0..total);
    for (id, times) in &eligible {
        ticket -= weight(*times);
        if ticket < 0.0 {
            return Some((id.clone(), false));
        }
    }
    eligible.last().map(|(id, _)| (id.clone(), false))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{rngs::StdRng, SeedableRng};

    #[test]
    fn random_is_uniform_and_weighted_prefers_less_selected() {
        let mut rng = StdRng::seed_from_u64(7);
        let candidates = vec![("a".into(), 0), ("b".into(), 3)];
        for (mode, expected) in [("random", 5000_i32), ("weighted", 8000)] {
            let count = (0..10000)
                .filter(|_| {
                    draw(&candidates, &HashSet::new(), mode, &mut rng)
                        .unwrap()
                        .0
                        == "a"
                })
                .count() as i32;
            assert!((count - expected).abs() < 230);
        }
    }
}
