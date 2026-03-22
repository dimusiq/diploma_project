from app.simulation.twin_seed import classify_queue_for_des


def test_classify_queue_names() -> None:
    assert classify_queue_for_des("dock_inbound") == "dock"
    assert classify_queue_for_des("pick_wave_1") == "pick"
    assert classify_queue_for_des("putaway_staging") == "putaway"
    assert classify_queue_for_des("unknown_lane") is None
