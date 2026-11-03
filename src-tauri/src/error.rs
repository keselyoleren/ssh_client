pub type Res<T> = Result<T, String>;

pub trait Ctx<T> {
    fn s(self) -> Res<T>;
    fn ctx(self, what: &str) -> Res<T>;
}

impl<T, E: std::fmt::Display> Ctx<T> for Result<T, E> {
    fn s(self) -> Res<T> {
        self.map_err(|e| e.to_string())
    }
    fn ctx(self, what: &str) -> Res<T> {
        self.map_err(|e| format!("{what}: {e}"))
    }
}
