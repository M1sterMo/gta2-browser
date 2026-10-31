#pragma once
#include <SDL2/SDL.h>
#include <SDL2/SDL_opengl.h>
#include <SDL2/SDL_opengl_glext.h>
#include <stdio.h>
#include <stdlib.h>

#define GL_FUNCS \
    X(PFNGLCREATESHADERPROC, glCreateShader) \
    X(PFNGLSHADERSOURCEPROC, glShaderSource) \
    X(PFNGLCOMPILESHADERPROC, glCompileShader) \
    X(PFNGLGETSHADERIVPROC, glGetShaderiv) \
    X(PFNGLGETSHADERINFOLOGPROC, glGetShaderInfoLog) \
    X(PFNGLCREATEPROGRAMPROC, glCreateProgram) \
    X(PFNGLATTACHSHADERPROC, glAttachShader) \
    X(PFNGLLINKPROGRAMPROC, glLinkProgram) \
    X(PFNGLGETPROGRAMIVPROC, glGetProgramiv) \
    X(PFNGLGETPROGRAMINFOLOGPROC, glGetProgramInfoLog) \
    X(PFNGLUSEPROGRAMPROC, glUseProgram) \
    X(PFNGLGETUNIFORMLOCATIONPROC, glGetUniformLocation) \
    X(PFNGLUNIFORM1IPROC, glUniform1i) \
    X(PFNGLUNIFORM4FPROC, glUniform4f) \
    X(PFNGLGENVERTEXARRAYSPROC, glGenVertexArrays) \
    X(PFNGLBINDVERTEXARRAYPROC, glBindVertexArray) \
    X(PFNGLDELETEVERTEXARRAYSPROC, glDeleteVertexArrays) \
    X(PFNGLGENBUFFERSPROC, glGenBuffers) \
    X(PFNGLBINDBUFFERPROC, glBindBuffer) \
    X(PFNGLBUFFERDATAPROC, glBufferData) \
    X(PFNGLDELETEBUFFERSPROC, glDeleteBuffers) \
    X(PFNGLENABLEVERTEXATTRIBARRAYPROC, glEnableVertexAttribArray) \
    X(PFNGLVERTEXATTRIBPOINTERPROC, glVertexAttribPointer) \
    X(PFNGLACTIVETEXTUREPROC, glActiveTexture)

#define X(type, name) extern type p##name;
GL_FUNCS
#undef X

#define glCreateShader pglCreateShader
#define glShaderSource pglShaderSource
#define glCompileShader pglCompileShader
#define glGetShaderiv pglGetShaderiv
#define glGetShaderInfoLog pglGetShaderInfoLog
#define glCreateProgram pglCreateProgram
#define glAttachShader pglAttachShader
#define glLinkProgram pglLinkProgram
#define glGetProgramiv pglGetProgramiv
#define glGetProgramInfoLog pglGetProgramInfoLog
#define glUseProgram pglUseProgram
#define glGetUniformLocation pglGetUniformLocation
#define glUniform1i pglUniform1i
#define glUniform4f pglUniform4f
#define glGenVertexArrays pglGenVertexArrays
#define glBindVertexArray pglBindVertexArray
#define glDeleteVertexArrays pglDeleteVertexArrays
#define glGenBuffers pglGenBuffers
#define glBindBuffer pglBindBuffer
#define glBufferData pglBufferData
#define glDeleteBuffers pglDeleteBuffers
#define glEnableVertexAttribArray pglEnableVertexAttribArray
#define glVertexAttribPointer pglVertexAttribPointer
#define glActiveTexture pglActiveTexture

inline bool LoadGLFunctions() {
#define X(type, name) \
    p##name = (type)SDL_GL_GetProcAddress(#name); \
    if (!p##name) { \
        fprintf(stderr, "Failed to load OpenGL function: %s\n", #name); \
        return false; \
    }
    GL_FUNCS
#undef X
    return true;
}
