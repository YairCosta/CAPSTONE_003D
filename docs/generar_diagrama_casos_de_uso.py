import math
import os
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse, Rectangle, Circle

plt.rcParams["font.family"] = ["Arial", "DejaVu Sans"]

OUT_DIR = r"C:\Users\USUARIO\Desktop\Revela\docs"
os.makedirs(OUT_DIR, exist_ok=True)

W, H = 152, 130
fig = plt.figure(figsize=(W / 10, H / 10))
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, W)
ax.set_ylim(0, H)
ax.set_aspect("equal")
ax.axis("off")

LW = 1.1
UC_W, UC_H = 24, 8.5

# ---------------------------------------------------------------- helpers
use_cases = {}


def use_case(key, x, y, text, w=UC_W, h=UC_H):
    ax.add_patch(Ellipse((x, y), w, h, fill=True, facecolor="white", edgecolor="black", lw=LW, zorder=3))
    ax.text(x, y, text, ha="center", va="center", fontsize=10.5, zorder=4, linespacing=1.25)
    use_cases[key] = (x, y, w, h)


def edge_point(key, tx, ty):
    x, y, w, h = use_cases[key]
    dx, dy = tx - x, ty - y
    if dx == 0 and dy == 0:
        return x, y
    t = 1 / math.sqrt((dx / (w / 2)) ** 2 + (dy / (h / 2)) ** 2)
    return x + dx * t, y + dy * t


actors = {}


def actor(key, x, y, label, side):
    ax.add_patch(Circle((x, y + 6), 2.2, fill=False, edgecolor="black", lw=LW, zorder=3))
    ax.plot([x, x], [y + 3.8, y - 3], color="black", lw=LW, zorder=3)
    ax.plot([x - 4.5, x + 4.5], [y + 1.8, y + 1.8], color="black", lw=LW, zorder=3)
    ax.plot([x, x - 3.5], [y - 3, y - 9], color="black", lw=LW, zorder=3)
    ax.plot([x, x + 3.5], [y - 3, y - 9], color="black", lw=LW, zorder=3)
    ax.text(x, y - 12, label, ha="center", va="center", fontsize=11, fontweight="bold")
    hand = (x + 4.5, y + 1.8) if side == "left" else (x - 4.5, y + 1.8)
    actors[key] = {"hand": hand, "head": (x, y + 8.2), "feet": (x, y - 14)}


def assoc(actor_key, uc_key):
    hx, hy = actors[actor_key]["hand"]
    ex, ey = edge_point(uc_key, hx, hy)
    ax.plot([hx, ex], [hy, ey], color="black", lw=LW, zorder=2)


def dependency(src, dst, label, label_offset=(0, 0)):
    sx0, sy0 = use_cases[src][:2]
    dx0, dy0 = use_cases[dst][:2]
    sx, sy = edge_point(src, dx0, dy0)
    ex, ey = edge_point(dst, sx0, sy0)
    ax.annotate(
        "",
        xy=(ex, ey),
        xytext=(sx, sy),
        arrowprops=dict(arrowstyle="->", linestyle=(0, (1.5, 2.5)), color="black", lw=1.3, mutation_scale=14),
        zorder=2,
    )
    mx, my = (sx + ex) / 2 + label_offset[0], (sy + ey) / 2 + label_offset[1]
    ax.text(mx, my, label, ha="center", va="center", fontsize=9.5, style="italic",
            bbox=dict(facecolor="white", edgecolor="none", pad=1), zorder=4)


# ---------------------------------------------------------------- sistema
BOX_X0, BOX_X1, BOX_Y0, BOX_Y1 = 24, 126, 15, 123
ax.add_patch(Rectangle((BOX_X0, BOX_Y0), BOX_X1 - BOX_X0, BOX_Y1 - BOX_Y0, fill=False, edgecolor="black", lw=LW))
ax.plot([BOX_X0, BOX_X1], [BOX_Y1 - 4.5, BOX_Y1 - 4.5], color="black", lw=LW)
ax.text((BOX_X0 + BOX_X1) / 2, BOX_Y1 - 2.25, "Revela", ha="center", va="center", fontsize=12.5, fontweight="bold")

COL_A = 44
# Usuario base
use_case("capturar", COL_A, 110, "Capturar lead")
use_case("pipeline", COL_A, 99, "Gestionar pipeline\n(mover etapas)")
use_case("contacto", COL_A, 88, "Registrar toma\nde contacto")
# Común a todos
use_case("login", COL_A, 77, "Iniciar sesión")
# Gerente
use_case("sin_comuna", COL_A, 66, "Resolver leads\nsin comuna")
use_case("kpi", COL_A, 55, "Ver KPI, mapa\ny gráfico de barras")
use_case("empresas", COL_A, 44, "Mantener empresas\ncliente")
use_case("contactos", COL_A, 33, "Editar contactos")
use_case("estados", COL_A, 22, "Configurar estados\ndel pipeline")

# Dependencias (centro)
use_case("empresa_nueva", 80, 110, "Registrar nueva\nempresa")
use_case("comuna", 80, 88, "Asignar comuna")

# Administrador (derecha)
use_case("crear_crm", 110, 110, "Crear CRM de\nempresa (tenant)")
use_case("estado_crm", 100, 94, "Activar / desactivar\nCRM")
use_case("crear_usuario", 100, 60, "Crear usuario\n(asignar perfil)")
use_case("estado_usuario", 110, 44, "Activar / desactivar\nusuario")

# ---------------------------------------------------------------- actores
actor("base", 11, 93, "Usuario base", "left")
actor("gerente", 11, 42, "Gerente", "left")
actor("admin", 140, 76, "Administrador", "right")

# Generalización: el Gerente hereda todos los casos de uso del Usuario base (incluido Iniciar sesión)
gx, gy = actors["gerente"]["head"]
bx, by = actors["base"]["feet"]
ax.annotate("", xy=(bx, by + 0.5), xytext=(gx, gy + 1),
            arrowprops=dict(arrowstyle="-|>", color="black", lw=LW, mutation_scale=22, fc="white"))
ax.text(bx + 1.5, (by + gy) / 2 + 1, "hereda", ha="left", va="center", fontsize=9.5, style="italic")

# ---------------------------------------------------------------- asociaciones
for uc in ["capturar", "pipeline", "contacto", "login"]:
    assoc("base", uc)
for uc in ["sin_comuna", "kpi", "empresas", "contactos", "estados"]:
    assoc("gerente", uc)
for uc in ["crear_crm", "estado_crm", "login", "crear_usuario", "estado_usuario"]:
    assoc("admin", uc)

# ---------------------------------------------------------------- include / extend
dependency("capturar", "comuna", "«include»", label_offset=(3.5, 1.5))
dependency("empresa_nueva", "capturar", "«extend»", label_offset=(0, 2.2))
dependency("sin_comuna", "comuna", "«include»", label_offset=(-3.5, 3))

# ---------------------------------------------------------------- leyenda
LY = 9
ax.text(BOX_X0, LY, "Simbología:", fontsize=10, fontweight="bold", va="center")
ax.plot([BOX_X0 + 13, BOX_X0 + 20], [LY, LY], color="black", lw=LW)
ax.text(BOX_X0 + 21.5, LY, "Asociación (el actor realiza el caso de uso)", fontsize=9.5, va="center")
ax.annotate("", xy=(BOX_X0 + 78, LY), xytext=(BOX_X0 + 70, LY),
            arrowprops=dict(arrowstyle="->", linestyle=(0, (1.5, 2.5)), color="black", lw=1.3, mutation_scale=12))
ax.text(BOX_X0 + 79.5, LY, "«include» obligatorio  /  «extend» opcional", fontsize=9.5, va="center")
ax.annotate("", xy=(BOX_X0 + 21, LY - 5), xytext=(BOX_X0 + 13, LY - 5),
            arrowprops=dict(arrowstyle="-|>", color="black", lw=LW, mutation_scale=16, fc="white"))
ax.text(BOX_X0 + 21.5, LY - 5,
        "Generalización: el Gerente puede hacer todo lo del Usuario base. "
        "Todos los casos de uso requieren iniciar sesión.",
        fontsize=9.5, va="center")

pdf_path = os.path.join(OUT_DIR, "diagrama-casos-de-uso-revela.pdf")
png_path = os.path.join(OUT_DIR, "diagrama-casos-de-uso-revela.png")
fig.savefig(pdf_path)
fig.savefig(png_path, dpi=110)
print(pdf_path)
print(png_path)
