import tkinter as tk

from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

import numpy as np
from numpy.polynomial import Polynomial

# ----------------------------------------------------------------------
# start input parameters

target_distance = 700.0  # km
travel_speed = 110.0  # km/h
min_soc = 20.0
max_soc = 100.0

consumption_100 = 13.0  # kWh/100km
consumption_120 = 18    # kWh/100km

battery_kwh = 80.0
time_20_80 = 20.0  # minutes
time_80_100 = 30.0  # minutes

# ----------------------------------------------------------------------
# functions

class charge_curve:
    """Return state of charge (%) over time.
    The cubic curve is constrained to pass through:
      - 20% at t = 0
      - 80% at t = time_20_80
      - 100% at t = time_20_80 + time_80_100
    and to flatten at 100% with zero slope at the end."""
    def __init__(self, t_20_80, t_80_100):
        t_end = t_20_80 + t_80_100
        # cubic coefficients a*t^3 + b*t^2 + c*t + d
        A = np.array([
            [0.0**3, 0.0**2, 0.0, 1.0],
            [t_20_80**3, t_20_80**2, t_20_80, 1.0],
            [t_end**3, t_end**2, t_end, 1.0],
            [3.0 * t_end**2, 2.0 * t_end, 1.0, 0.0],
        ])
        y = np.array([20.0, 80.0, 100.0, 0.0])
        self.coeffs = np.linalg.solve(A, y)

    def __call__(self, time):
        return np.polyval(self.coeffs, time)


def travel_distance_over_time(distance_km, battery_kwh,
                              consumption_model, charge_model,
                              speed_kmh, min_soc=20.0, max_soc=100.0):
    """Return time, distance and State of Charge arrays for a trip with charging pauses."""
    if distance_km <= 0 or speed_kmh <= 0 or max_soc <= min_soc:
        return np.array([0.0]), np.array([0.0]), np.array([100.0])

    consumption = consumption_model(speed_kmh)
    first_leg_energy = battery_kwh * (100.0 - min_soc) / 100.0
    first_leg_range = first_leg_energy / (consumption / 100.0)
    subsequent_leg_energy = battery_kwh * (max_soc - min_soc) / 100.0
    subsequent_leg_range = subsequent_leg_energy / (consumption / 100.0)
    
    def charge_time_between_soc(start_soc, end_soc, time_20_80, time_80_100):
        full_time = time_20_80 + time_80_100
        if end_soc <= start_soc:
            return 0.0, 0.0
        grid = np.linspace(0.0, full_time, 2001)
        curve = charge_model(grid)
        start_t = 0.0 if start_soc <= 20.0 else float(np.interp(start_soc, curve, grid))
        end_t = full_time if end_soc >= 100.0 else float(np.interp(end_soc, curve, grid))
        return max(0.0, end_t - start_t), start_t

    charge_target_time, charge_start_time = charge_time_between_soc(min_soc, max_soc, time_20_80, time_80_100)
    charge_time_h = charge_target_time / 60.0

    if first_leg_range <= 0 or subsequent_leg_range <= 0:
        return np.array([0.0]), np.array([0.0]), np.array([100.0])

    times = [0.0]
    distances = [0.0]
    socs = [100.0]
    remaining = distance_km
    current_time = 0.0
    current_distance = 0.0
    current_soc = 100.0
    is_first_leg = True

    while remaining > 1e-3:
        if is_first_leg:
            drive_leg = min(remaining, first_leg_range)
            leg_range = first_leg_range
            is_first_leg = False
        else:
            drive_leg = min(remaining, subsequent_leg_range)
            leg_range = subsequent_leg_range

        drive_time = drive_leg / speed_kmh
        current_time += drive_time
        current_distance += drive_leg
        
        if leg_range == first_leg_range:
            current_soc = 100.0 - (100.0 - min_soc) * (drive_leg / leg_range)
        else:
            current_soc = max_soc - (max_soc - min_soc) * (drive_leg / leg_range)
            
        times.append(current_time)
        distances.append(current_distance)
        socs.append(current_soc)
        remaining -= drive_leg

        if remaining <= 1e-3:
            break

        charge_grid = np.linspace(charge_start_time, charge_start_time + charge_target_time, 21)
        base_soc = charge_model(charge_grid)

        for t_abs, soc in zip(charge_grid[1:], base_soc[1:]):
            times.append(current_time + (t_abs - charge_start_time) / 60.0)
            distances.append(current_distance)
            socs.append(soc)

        current_time += charge_time_h
        current_soc = max_soc

    return np.array(times), np.array(distances), np.array(socs)


def update_plot(val=None):
    """Update the plot with current parameter values."""

    # read parameters from GUI
    target_dist = float(entry_distance.get())
    battery  = float(entry_battery.get())

    cons_100 = float(entry_cons_100.get())
    cons_120 = float(entry_cons_120.get())
    t_20_80  = float(entry_time_20_80.get())
    t_80_100 = float(entry_time_80_100.get())

    speed = slider_speed.get()
    min_s = slider_min_soc.get()
    max_s = slider_max_soc.get()

    consumption_model = Polynomial.fit([0, 100, 120], [0, cons_100, cons_120], deg=2)
        
    charge_model = charge_curve(t_20_80, t_80_100)

    if max_s <= min_s:
        max_s = min_s + 1

    trip_time, trip_distance, trip_soc = travel_distance_over_time(
        target_dist, battery,
        consumption_model, charge_model,
        speed, min_soc=min_s, max_soc=max_s,
    )

    # update consumption model coefficients display
    if consumption_model.convert().coef[2] <= 0:
        label_consumption_coeffs.pack(anchor='w', padx=5)
    else:
        label_consumption_coeffs.pack_forget()

    # update plot
    ax1.clear()
    ax2.clear()

    ax1.plot(trip_time, trip_distance, color='tab:blue', linewidth=2, label='distance traveled')
    ax1.set_xlabel('time / h')
    ax1.set_ylabel('distance / km', color='tab:blue')
    ax1.tick_params(axis='y', colors='tab:blue')
    ax1.spines['left'].set_color('tab:blue')
    ax1.grid(True)

    ax2.plot(trip_time, trip_soc, color='tab:orange', linestyle='--', linewidth=2, label='state of charge')
    ax2.set_ylabel('state of charge / %', color='tab:orange')
    ax2.yaxis.set_label_position('right')
    ax2.yaxis.set_label_coords(1.05, 0.5)
    ax2.tick_params(axis='y', colors='tab:orange')
    ax2.spines['right'].set_color('tab:orange')
    ax2.set_ylim(0, 100)

    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc='lower right')
    fig.suptitle('Electric vehicle travel time and charge optimization', fontsize=14)

    # compute summary values
    total_hours = trip_time[-1]
    hours = int(total_hours)
    minutes = int(round((total_hours - hours) * 60))
    if minutes == 60:
        hours += 1
        minutes = 0

    consumption = consumption_model(speed)

    energy_needed = consumption * target_dist / 100.0

    usable_range_km = battery * (max_s - min_s) / consumption

    diff = trip_distance[1:] - trip_distance[:-1]
    stops = int(np.sum((diff[:-1] == 0.0) & (diff[1:] > 0.0)))

    end_soc_value = trip_soc[-1] if len(trip_soc) > 0 else 100.0

    label_time_traveled.config(text=f"{hours:d}:{minutes:02d} h")
    label_energy_needed.config(text=f"{round(energy_needed)} kWh")
    label_avg_consumption.config(text=f"{consumption:.1f} kWh/100km")
    label_usable_range.config(text=f"{usable_range_km:.0f} km")
    label_charging_stops.config(text=f"{stops}")
    label_end_soc.config(text=f"{end_soc_value:.1f} %")

    canvas.draw()


# ----------------------------------------------------------------------
# create GUI elements

def main():

    global entry_distance, entry_battery, entry_cons_100, entry_cons_120, entry_time_20_80, entry_time_80_100
    global slider_speed, slider_min_soc, slider_max_soc
    global label_time_traveled, label_energy_needed, label_avg_consumption, label_usable_range, label_charging_stops, label_end_soc
    global label_consumption_coeffs
    global ax1, ax2, fig, canvas

    root = tk.Tk()
    root.title("Travel time and charge optimization")

    # figure and plot
    fig = Figure(figsize=(8, 4), dpi=100)
    ax1 = fig.add_subplot(111)
    ax2 = ax1.twinx()
    canvas = FigureCanvasTkAgg(fig, master=root)
    canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)

    # controls frame
    controls_frame = tk.Frame(root)
    controls_frame.pack(side=tk.LEFT, padx=10, pady=10, fill=tk.BOTH, expand=True)

    # left column - text inputs
    left_frame = tk.Frame(controls_frame)
    left_frame.pack(side=tk.LEFT, padx=5)

    tk.Label(left_frame, text="Parameters", font=("Arial", 12, "bold")).pack()

    # helper function to create labeled entry with unit on right
    def create_labeled_entry(parent, label_text, unit_text, default_value, callback):
        frame = tk.Frame(parent)
        frame.pack(pady=2)
        tk.Label(frame, text=label_text, width=30, anchor='w').pack(side=tk.LEFT)
        entry = tk.Entry(frame, width=12)
        entry.insert(0, str(default_value))
        entry.pack(side=tk.LEFT, padx=2)
        tk.Label(frame, text=unit_text, width=15, anchor='w').pack(side=tk.LEFT)
        entry.bind('<KeyRelease>', callback)
        return entry

    # create text entries for parameters
    entry_distance    = create_labeled_entry(left_frame, "Total trip distance"    , "km"       , target_distance, update_plot)
    entry_battery     = create_labeled_entry(left_frame, "Battery capacity"       , "kWh"      , battery_kwh    , update_plot)
    entry_cons_100    = create_labeled_entry(left_frame, "Consumption at 100 km/h", "kWh/100km", consumption_100, update_plot)
    entry_cons_120    = create_labeled_entry(left_frame, "Consumption at 120 km/h", "kWh/100km", consumption_120, update_plot)
    entry_time_20_80  = create_labeled_entry(left_frame, "Charging Time 20→80%"   , "min"      , time_20_80     , update_plot)
    entry_time_80_100 = create_labeled_entry(left_frame, "Charging Time 80→100%"  , "min"      , time_80_100    , update_plot)

    # consumption model coefficients display
    label_consumption_coeffs = tk.Label(left_frame, 
        text="Consumption curve not monotonically increasing.\n" \
        "Check consumption values.", font=("Arial", 9), fg="red", justify=tk.LEFT)
    label_consumption_coeffs.pack_forget()

    # right column - sliders and summary
    right_frame = tk.Frame(controls_frame)
    right_frame.pack(side=tk.RIGHT, padx=5, fill=tk.BOTH, expand=True)

    slider_frame = tk.Frame(right_frame)
    slider_frame.pack(side=tk.LEFT, padx=(0, 10), fill=tk.Y)

    output_frame = tk.Frame(right_frame)
    output_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

    summary_frame = tk.Frame(output_frame)
    summary_frame.pack(pady=(5, 0), expand=True)

    tk.Label(slider_frame, text="Travel speed / km/h", font=("Arial", 11, "bold")).pack(pady=(5, 0))
    slider_speed = tk.Scale(slider_frame, from_=80, to=150, orient=tk.HORIZONTAL, 
                            command=update_plot, length=180)
    slider_speed.set(travel_speed)
    slider_speed.pack()

    tk.Label(slider_frame, text="Min State of Charge / %", font=("Arial", 11, "bold")).pack(pady=(10, 0))
    slider_min_soc = tk.Scale(slider_frame, from_=0, to=50, orient=tk.HORIZONTAL, 
                            command=update_plot, length=180)
    slider_min_soc.set(min_soc)
    slider_min_soc.pack()

    tk.Label(slider_frame, text="Max State of Charge / %", font=("Arial", 11, "bold")).pack(pady=(10, 0))
    slider_max_soc = tk.Scale(slider_frame, from_=50, to=100, orient=tk.HORIZONTAL, 
                            command=update_plot, length=180)
    slider_max_soc.set(max_soc)
    slider_max_soc.pack()

    summary_frame = tk.Frame(output_frame)
    summary_frame.pack(pady=(5, 0), fill=tk.BOTH, expand=True)

    # helper function to create summary rows
    def create_summary_row(parent, title):
        row = tk.Frame(parent)
        row.pack(fill=tk.X, pady=2)
        tk.Label(row, text=title, width=18, anchor='w').pack(side=tk.LEFT)
        value = tk.Label(row, text="", width=12, anchor='e')
        value.pack(side=tk.RIGHT)
        return value

    # create summary labels
    label_time_traveled   = create_summary_row(summary_frame, "Time traveled"      )
    label_energy_needed   = create_summary_row(summary_frame, "Energy needed"      )
    label_avg_consumption = create_summary_row(summary_frame, "Avg. consumption"   )
    label_usable_range    = create_summary_row(summary_frame, "Usable range"       )
    label_charging_stops  = create_summary_row(summary_frame, "Charging stops"     )
    label_end_soc         = create_summary_row(summary_frame, "End State of Charge")

    # initial plot
    update_plot()

    root.mainloop()


if __name__ == "__main__":
    main()