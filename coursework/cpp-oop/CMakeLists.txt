cmake_minimum_required(VERSION 3.20)
project(RBACSystem LANGUAGES C CXX)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(CMAKE_C_STANDARD 23)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS ON)

add_library(sqlite3 STATIC src/sqlite3.c)
target_include_directories(sqlite3 PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include")

add_executable(rbac
    src/main.cpp
    src/AccessControl.cpp
    src/Admin.cpp
    src/AuditLog.cpp
    src/AuthManager.cpp
    src/Database.cpp
    src/Student.cpp
    src/Teacher.cpp
    src/User.cpp
)
target_include_directories(rbac PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/include")
target_link_libraries(rbac PRIVATE sqlite3)
