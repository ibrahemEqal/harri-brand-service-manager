/** Draft fields based on one observed Harri request, not a complete API schema. */
export type GroupInput = {
  name: string;
  countryCode: string;
  timeZoneName: string;
  startDayOfWeek: string;
  openTime: number;
  closeTime: number;
  closeTimeExtension: number;
};
export const observedAutoAssign = [
  {
    name: "enable_avoid_scheduling_employees_when_off",
    value: true,
    enabled: true,
    editable: true,
  },
  {
    name: "enable_schedule_most_skilled_employees_at_peak_hours",
    value: true,
    enabled: true,
    editable: true,
  },
  {
    name: "enable_equal_hours_for_all_employees",
    value: true,
    enabled: true,
    editable: true,
  },
  {
    name: "enable_optimize_employee_hourly_rate",
    value: true,
    enabled: true,
    editable: true,
  },
  {
    name: "enable_schedule_based_on_employee_availability",
    value: "ALWAYS",
    enabled: true,
    editable: true,
  },
  {
    name: "enable_maximum_days_per_week",
    value: 5,
    enabled: true,
    editable: false,
  },
  { name: "enable_match_station", value: true, enabled: true, editable: true },
  {
    name: "enable_good_faith_estimate_or_regular_schedule",
    value: true,
    enabled: true,
    editable: true,
  },
  {
    name: "enable_start_assigning_from_weekend",
    value: false,
    enabled: false,
    editable: false,
  },
  {
    name: "enable_assign_utilized_shifts_first",
    value: false,
    enabled: false,
    editable: false,
  },
  {
    name: "enable_assign_new_hires_after_skilled_employees",
    value: false,
    enabled: false,
    editable: false,
  },
  {
    name: "enable_assign_most_skilled_employees_first",
    value: false,
    enabled: false,
    editable: false,
  },
  {
    name: "enable_do_not_assign_employees_with_specific_skill",
    value: false,
    enabled: false,
    editable: false,
  },
  {
    name: "enable_assign_open_shifts_to_new_hires_only",
    value: false,
    enabled: false,
    editable: false,
  },
  {
    name: "enable_schedule_based_on_working_pattern",
    value: false,
    enabled: false,
    editable: false,
  },
] as const;
export function buildObservedPayload(input: GroupInput) {
  return {
    name: input.name,
    brands: [],
    settings: {
      country_code: input.countryCode,
      time_zone_name: input.timeZoneName,
      start_day_of_week: input.startDayOfWeek,
      schedule_shift_mode: "FREE_STYLE",
      business_day: {
        open_time: input.openTime,
        close_time: input.closeTime,
        close_time_extension: input.closeTimeExtension,
      },
      break_engine: { mode: "STATIC", customization_mode: "NONE" },
      overtime_settings: { guest_weekly_overtime_enabled: false },
      holiday_year: null,
      enable_total_sales_count: true,
      enable_total_guests_count: true,
      enable_total_checks_count: false,
      enable_total_units_count: false,
      split_food_and_total_sales: false,
      shift_break_times_mode: "NO_PREFERENCE",
      is_minor_rules_enabled: false,
      treat_as_minor: false,
      schedule_stats_enabled: false,
      auto_and_quick_assign_shifts_enabled: false,
      auto_assign: observedAutoAssign.map((item) => ({ ...item })),
      show_cplh: false,
      show_lhpc: false,
      assignee_shift_forecasted_recurrence_enabled: false,
      overnight_shift_settings: { status: "INACTIVE" },
      employee_payment_types: [
        {
          type: "SALARIED",
          track_mode: "HOURLY",
          cross_location_edit_mode: "NONE",
        },
      ],
    },
  };
}
