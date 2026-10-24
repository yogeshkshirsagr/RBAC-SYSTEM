# C++ OOP review notes

- `User` is an abstract base class: `getRole()` and `showMenu()` are pure
  virtual functions. Its virtual destructor supports safe destruction through
  a base pointer.
- `Admin`, `Teacher`, and `Student` derive from `User` and provide role-specific
  implementations of those virtual functions (runtime polymorphism).
- `AuthManager` receives a `Database` by reference and returns an authenticated
  user as `std::unique_ptr<User>`, so ownership is explicit while callers use
  the common base interface.
- `AccessControl` centralizes role/action checks in a static permission helper.
- `Database` owns a SQLite connection, closes it in its destructor, disallows
  copying, and uses `std::optional` to represent a missing authenticated user.
- `AuditLog` wraps audit recording through the database abstraction.
- `CMakeLists.txt` builds SQLite from the preserved amalgamation and links it to
  the RBAC executable. C++ is configured as C++20 and SQLite as C23.

## Viva prompts

1. Why are `getRole()` and `showMenu()` virtual, and why is `User` abstract?
2. What does `std::unique_ptr<User>` own, and why does the virtual destructor
   matter?
3. How does `Database` manage the SQLite connection lifetime?
4. What does deleting the `Database` copy constructor prevent?
5. Why are SQL parameters bound instead of interpolated into a query?
6. How does the program distinguish authentication from permission checking?
