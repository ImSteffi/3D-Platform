package com.example.platform.scan;

import java.util.List;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

@Embeddable
public class ScanStartingView {
    @Column(name = "start_position_x") private Double positionX;
    @Column(name = "start_position_y") private Double positionY;
    @Column(name = "start_position_z") private Double positionZ;
    @Column(name = "start_target_x") private Double targetX;
    @Column(name = "start_target_y") private Double targetY;
    @Column(name = "start_target_z") private Double targetZ;
    @Column(name = "start_fov") private Double fov;

    protected ScanStartingView() {}

    public ScanStartingView(List<Double> position, List<Double> target, double fov) {
        positionX = position.get(0); positionY = position.get(1); positionZ = position.get(2);
        targetX = target.get(0); targetY = target.get(1); targetZ = target.get(2);
        this.fov = fov;
    }

    public List<Double> getPosition() { return List.of(positionX, positionY, positionZ); }
    public List<Double> getTarget() { return List.of(targetX, targetY, targetZ); }
    public Double getFov() { return fov; }
}
